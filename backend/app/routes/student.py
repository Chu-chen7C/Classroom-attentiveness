from flask import Blueprint, request, jsonify
import base64
from app.database import execute_query, execute_one, execute_insert, execute_update
from app.utils.auth import token_required, teacher_required

student_bp = Blueprint('student', __name__)


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
    if len(images) == 0:
        return jsonify({'error': '无有效图像数据', 'code': 400}), 400

    print(f"[FaceReg] 收到注册请求: studentId={student_id}, images={len(images)}")

    student = execute_one("SELECT * FROM Students WHERE id = ?", (int(student_id),))
    if not student:
        return jsonify({'error': '学生不存在', 'code': 404}), 404

    from app.services.face_service import extract_face_features_with_meta
    samples = []
    rejected = 0
    for img in images[:8]:
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

    # Prefer high-quality samples and average for robust enrollment.
    samples.sort(key=lambda s: s['quality'], reverse=True)
    top_samples = samples[:min(5, len(samples))]
    valid_samples = [s for s in top_samples if s['ok']]
    if len(valid_samples) == 0:
        valid_samples = top_samples[:min(2, len(top_samples))]

    import numpy as np
    feat_arr = np.array([s['features'] for s in valid_samples], dtype=np.float32)
    features = np.mean(feat_arr, axis=0).tolist()
    norm = float(np.linalg.norm(np.array(features)))
    if norm > 1e-8:
        features = (np.array(features) / norm).tolist()

    features_bytes = ','.join(map(str, features)).encode('utf-8')

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
        'rejectedSamples': rejected
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
