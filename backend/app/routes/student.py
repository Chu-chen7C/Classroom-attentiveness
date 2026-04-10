from flask import Blueprint, request, jsonify
import base64
import json
import cv2
import numpy as np
from app.database import execute_query, execute_one, execute_insert, execute_update
from app.utils.auth import token_required, teacher_required

student_bp = Blueprint('student', __name__)

MAX_ENROLL_INPUT_IMAGES = 12
MAX_ENROLL_EXPANDED_IMAGES = 28
TEMPLATE_TARGET_COUNT = 8

def _decode_base64_image(image_b64: str):
    try:
        payload = image_b64.split(',')[1] if ',' in image_b64 else image_b64
        img_bytes = base64.b64decode(payload)
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def _encode_base64_image(image_bgr):
    ok, buf = cv2.imencode('.jpg', image_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        return None
    b64 = base64.b64encode(buf.tobytes()).decode('utf-8')
    return f"data:image/jpeg;base64,{b64}"


def _generate_augmented_images(image_b64: str):
    """
    Create mild variations to improve enrollment robustness under surveillance shifts:
    slight brightness/contrast/rotation changes only.
    """
    img = _decode_base64_image(image_b64)
    if img is None or img.size == 0:
        return [image_b64]

    variants = [img]
    h, w = img.shape[:2]

    # 1) slight brightness/contrast shift
    light = cv2.convertScaleAbs(img, alpha=1.06, beta=8)
    dark = cv2.convertScaleAbs(img, alpha=0.94, beta=-6)
    variants.extend([light, dark])

    # 2) slight pose perturbation via tiny rotation
    center = (w / 2.0, h / 2.0)
    for angle in (-4.0, 4.0):
        m = cv2.getRotationMatrix2D(center, angle, 1.0)
        rot = cv2.warpAffine(
            img, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE
        )
        variants.append(rot)

    outputs = []
    for v in variants:
        b64 = _encode_base64_image(v)
        if b64:
            outputs.append(b64)
    return outputs if outputs else [image_b64]


def _cosine_distance(a, b):
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    na = float(np.linalg.norm(va))
    nb = float(np.linalg.norm(vb))
    if na <= 1e-8 or nb <= 1e-8:
        return 1.0
    sim = float(np.dot(va, vb) / (na * nb))
    return 1.0 - sim


def _select_diverse_templates(samples, target_count):
    """
    Select high-quality but diverse templates (greedy max-min diversity with quality prior).
    """
    if len(samples) <= target_count:
        return samples

    ranked = sorted(samples, key=lambda s: float(s.get('quality', 0.0)), reverse=True)
    selected = [ranked[0]]
    for candidate in ranked[1:]:
        if len(selected) >= target_count:
            break
        dists = [
            _cosine_distance(candidate['features'], kept['features'])
            for kept in selected
        ]
        min_dist = min(dists) if dists else 1.0
        # Keep templates that are not near-duplicates.
        if min_dist >= 0.022:
            selected.append(candidate)

    if len(selected) < target_count:
        for candidate in ranked:
            if len(selected) >= target_count:
                break
            if candidate in selected:
                continue
            selected.append(candidate)
    return selected


@student_bp.route('', methods=['GET'])
@token_required
def list_students():
    classroom_id = request.args.get('classroomId')
    if not classroom_id:
        return jsonify({'error': '缺少 classroomId 参数', 'code': 400}), 400

    students = execute_query(
        """SELECT s.id, s.student_number, s.real_name, s.seat_row, s.seat_col,
                  s.face_registered, s.join_time
           FROM Students s
           WHERE s.classroom_id = ?
           ORDER BY s.real_name""",
        (int(classroom_id),)
    )

    result = []
    for s in students:
        result.append({
            'id': str(s['id']),
            'studentId': s['student_number'],
            'name': s['real_name'],
            'seatRow': s['seat_row'],
            'seatCol': s['seat_col'],
            'faceRegistered': bool(s['face_registered']),
            'joinTime': _format_dt(s['join_time'])
        })

    return jsonify(result)


@student_bp.route('', methods=['POST'])
@teacher_required
def add_student():
    data = request.get_json()
    required = ['studentId', 'name', 'classroomId']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} 不能为空', 'code': 400}), 400

    classroom = execute_one("SELECT id FROM Classrooms WHERE id = ?", (int(data['classroomId']),))
    if not classroom:
        return jsonify({'error': '班级不存在', 'code': 404}), 404

    existing = execute_one(
        "SELECT id FROM Students WHERE student_number = ? AND classroom_id = ?",
        (data['studentId'].strip(), int(data['classroomId']))
    )
    if existing:
        return jsonify({'error': '该学号在此班级中已存在', 'code': 409}), 409

    student_id = execute_insert(
        """INSERT INTO Students (classroom_id, student_number, real_name, seat_row, seat_col)
           VALUES (?, ?, ?, ?, ?)""",
        (
            int(data['classroomId']),
            data['studentId'].strip(),
            data['name'].strip(),
            data.get('seatRow'),
            data.get('seatCol')
        )
    )

    execute_update(
        "UPDATE Classrooms SET student_count = student_count + 1 WHERE id = ?",
        (int(data['classroomId']),)
    )

    return jsonify({'id': str(student_id), 'message': '学生添加成功'}), 201


@student_bp.route('/<int:student_id>', methods=['PUT'])
@teacher_required
def update_student(student_id):
    data = request.get_json()
    student = execute_one("SELECT * FROM Students WHERE id = ?", (student_id,))
    if not student:
        return jsonify({'error': '学生不存在', 'code': 404}), 404

    updates = []
    params = []
    fields_map = {
        'studentId': 'student_number',
        'name': 'real_name',
        'seatRow': 'seat_row',
        'seatCol': 'seat_col'
    }
    for key, col in fields_map.items():
        if key in data:
            updates.append(f"{col} = ?")
            params.append(data[key])

    if updates:
        params.append(student_id)
        execute_update(
            f"UPDATE Students SET {', '.join(updates)}, updated_at = GETDATE() WHERE id = ?",
            tuple(params)
        )

    return jsonify({'message': '学生信息更新成功'})


@student_bp.route('/<int:student_id>', methods=['DELETE'])
@teacher_required
def delete_student(student_id):
    student = execute_one("SELECT * FROM Students WHERE id = ?", (student_id,))
    if not student:
        return jsonify({'error': '学生不存在', 'code': 404}), 404

    execute_update("DELETE FROM StudentAnswers WHERE student_id = ?", (student_id,))
    execute_update("DELETE FROM AttentionData WHERE student_id = ?", (student_id,))
    execute_update("DELETE FROM Students WHERE id = ?", (student_id,))
    execute_update(
        "UPDATE Classrooms SET student_count = GREATEST(student_count - 1, 0) WHERE id = ?",
        (student['classroom_id'],)
    )

    return jsonify({'message': '学生已删除'})


@student_bp.route('/face/register', methods=['POST'])
@teacher_required
def register_face():
    data = request.get_json()
    student_id = data.get('studentId')
    face_image_base64 = data.get('image')
    face_images = data.get('images')

    if not student_id or (not face_image_base64 and not face_images):
        return jsonify({'error': '缺少必要参数(studentId或image/images)', 'code': 400}), 400

    images = []
    if isinstance(face_images, list) and len(face_images) > 0:
        images = [x for x in face_images if isinstance(x, str) and x.strip()]
    elif isinstance(face_image_base64, str) and face_image_base64.strip():
        images = [face_image_base64]
    images = images[:MAX_ENROLL_INPUT_IMAGES]
    if len(images) == 0:
        return jsonify({'error': '无有效图像数据', 'code': 400}), 400

    print(f"[FaceReg] 收到注册请求: studentId={student_id}, images={len(images)}")

    student = execute_one("SELECT * FROM Students WHERE id = ?", (int(student_id),))
    if not student:
        return jsonify({'error': '学生不存在', 'code': 404}), 404

    from app.services.face_service import extract_face_features_with_meta
    expanded_images = []
    for img in images:
        expanded_images.extend(_generate_augmented_images(img))
        if len(expanded_images) >= MAX_ENROLL_EXPANDED_IMAGES:
            break
    expanded_images = expanded_images[:MAX_ENROLL_EXPANDED_IMAGES]

    samples = []
    rejected = 0
    for img in expanded_images:
        meta = extract_face_features_with_meta(img)
        if not meta.get('features'):
            rejected += 1
            continue
        quality_score = float(meta.get('quality', {}).get('score', 0.0))
        samples.append({
            'features': meta['features'],
            'quality': quality_score,
            'ok': bool(meta.get('ok', False))
        })
    if len(samples) == 0:
        return jsonify({'error': '未检测到有效人脸，请确保面部清晰、正对摄像头、光线充足', 'code': 400}), 400

    # Prefer high-quality + diverse templates for stronger cross-scene recognition.
    samples.sort(key=lambda s: s['quality'], reverse=True)
    top_samples = samples[:min(16, len(samples))]
    valid_samples = [s for s in top_samples if s['ok']]
    if len(valid_samples) == 0:
        valid_samples = top_samples[:min(4, len(top_samples))]
    valid_samples = _select_diverse_templates(valid_samples, TEMPLATE_TARGET_COUNT)

    feat_arr = np.array([s['features'] for s in valid_samples], dtype=np.float32)
    features = np.mean(feat_arr, axis=0).tolist()
    norm = float(np.linalg.norm(np.array(features)))
    if norm > 1e-8:
        features = (np.array(features) / norm).tolist()

    template_payload = {
        'version': 2,
        'method': 'multi_template_enroll',
        'prototype': [round(float(x), 6) for x in features],
        'templates': [
            {
                'vector': [round(float(v), 6) for v in s['features']],
                'quality': round(float(s.get('quality', 0.0)), 4)
            }
            for s in valid_samples
        ],
        'quality': {
            'sampleCount': len(valid_samples),
            'rejectedSamples': rejected,
            'inputImageCount': len(images),
            'expandedImageCount': len(expanded_images),
            'avgSampleQuality': round(float(np.mean([s.get('quality', 0.0) for s in valid_samples])), 4),
            'bestSampleQuality': round(float(max([s.get('quality', 0.0) for s in valid_samples])), 4),
        }
    }
    features_bytes = json.dumps(template_payload, ensure_ascii=False).encode('utf-8')

    image_path = f"/uploads/faces/{student_id}_{__import__('datetime').datetime.now().strftime('%Y%m%d%H%M%S')}.jpg"

    execute_update(
        """UPDATE Students
           SET face_registered = 1, face_features = ?, face_image_path = ?, updated_at = GETDATE()
           WHERE id = ?""",
        (features_bytes, image_path, int(student_id))
    )

    print(f"[FaceReg] 注册成功: studentId={student_id}, featureDim={len(features)}")
    return jsonify({
        'message': '人脸录入成功',
        'features': features[:10],
        'featureCount': len(features),
        'sampleCount': len(valid_samples),
        'rejectedSamples': rejected,
        'templateCount': len(valid_samples),
        'expandedImageCount': len(expanded_images),
    })


@student_bp.route('/face/delete', methods=['POST'])
@teacher_required
def delete_face():
    data = request.get_json()
    student_id = data.get('studentId')

    if not student_id:
        return jsonify({'error': '缺少 studentId 参数', 'code': 400}), 400

    student = execute_one("SELECT id FROM Students WHERE id = ?", (int(student_id),))
    if not student:
        return jsonify({'error': '学生不存在', 'code': 404}), 404

    execute_update(
        """UPDATE Students
           SET face_registered = 0, face_features = NULL,
               face_image_path = NULL, updated_at = GETDATE()
           WHERE id = ?""",
        (int(student_id),)
    )

    return jsonify({'message': '人脸数据已删除'})


def _format_dt(dt):
    if dt is None:
        return None
    try:
        return dt.strftime('%Y-%m-%d %H:%M:%S') if hasattr(dt, 'strftime') else str(dt)
    except:
        return str(dt)
