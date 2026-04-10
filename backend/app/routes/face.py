from flask import Blueprint, request, jsonify
import os
import json
import time
from app.services.face_service import (
    detect_faces,
    extract_face_features,
    recognize_face,
    process_frame_for_monitoring,
    get_performance_stats,
    get_calibration,
    update_calibration
)
from app.database import execute_query, execute_one

face_bp = Blueprint('face', __name__)

_debug_log_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    'debug-24509c.log'
)
_debug_log_path_41bf64 = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    'debug-41bf64.log'
)
_last_monitor_request_ms_41bf64 = None


def _debug_log(run_id, hypothesis_id, location, message, data):
    try:
        payload = {
            'sessionId': '24509c',
            'runId': run_id,
            'hypothesisId': hypothesis_id,
            'location': location,
            'message': message,
            'data': data,
            'timestamp': int(time.time() * 1000),
        }
        with open(_debug_log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(payload, ensure_ascii=False) + '\n')
    except Exception:
        pass


def _debug_log_41bf64(run_id, hypothesis_id, location, message, data):
    try:
        payload = {
            'sessionId': '41bf64',
            'runId': run_id,
            'hypothesisId': hypothesis_id,
            'location': location,
            'message': message,
            'data': data,
            'timestamp': int(time.time() * 1000),
        }
        with open(_debug_log_path_41bf64, 'a', encoding='utf-8') as f:
            f.write(json.dumps(payload, ensure_ascii=False) + '\n')
    except Exception:
        pass


@face_bp.route('/detect', methods=['POST'])
def detect():
    data = request.get_json()
    image_data = data.get('image')
    if not image_data:
        return jsonify({'error': '缺少图像数据', 'code': 400}), 400

    faces = detect_faces(image_data)
    return jsonify({
        'faces': faces,
        'count': len(faces)
    })


@face_bp.route('/extract-features', methods=['POST'])
def extract_features():
    data = request.get_json()
    image_data = data.get('image')
    if not image_data:
        return jsonify({'error': '缺少图像数据', 'code': 400}), 400

    features = extract_face_features(image_data)
    if features is None:
        return jsonify({'error': '未检测到有效人脸', 'code': 400}), 400

    return jsonify({
        'features': features,
        'dimension': len(features),
        'message': '特征提取成功'
    })


@face_bp.route('/recognize', methods=['POST'])
def recognize():
    data = request.get_json()
    image_data = data.get('image')
    student_id = data.get('studentId')

    if not image_data:
        return jsonify({'error': '缺少图像数据', 'code': 400}), 400

    known_students = execute_query(
        "SELECT id, real_name, face_features FROM Students WHERE face_registered = 1"
    )

    if not known_students or len(known_students) == 0:
        return jsonify({'error': '数据库中无已注册人脸数据', 'code': 404}), 404

    known_features = []
    for s in known_students:
        feat_str = s['face_features']
        if isinstance(feat_str, bytes):
            try:
                feat_str = feat_str.decode('utf-8')
            except Exception:
                continue
        if feat_str:
            known_features.append(feat_str)

    result = recognize_face(image_data, known_features)

    if result['matched'] and result['matchIndex'] >= 0:
        matched_student = known_students[result['matchIndex']]
        result['student'] = {
            'id': str(matched_student['id']),
            'name': matched_student['real_name']
        }
    else:
        result['student'] = None

    return jsonify(result)


@face_bp.route('/monitoring/analyze', methods=['POST'])
def monitoring_analyze():
    global _last_monitor_request_ms_41bf64
    data = request.get_json()
    image_base64 = data.get('image')
    classroom_id = data.get('classroomId')
    now_ms = int(time.time() * 1000)
    delta_since_last = None if _last_monitor_request_ms_41bf64 is None else (now_ms - _last_monitor_request_ms_41bf64)
    _last_monitor_request_ms_41bf64 = now_ms
    # region agent log
    _debug_log_41bf64(
        'pre-fix',
        'H7',
        'face.py:monitoring_analyze:arrival',
        'monitoring request arrived',
        {
            'deltaSinceLastRequestMs': delta_since_last,
            'hasImage': bool(image_base64),
            'classroomIdPresent': classroom_id is not None,
            'imageSize': len(image_base64) if isinstance(image_base64, str) else 0,
        }
    )
    # endregion
    # region agent log
    _debug_log(
        'pre-fix',
        'H6',
        'face.py:monitoring_analyze:entry',
        'monitoring analyze route entered',
        {
            'hasImage': bool(image_base64),
            'classroomIdPresent': classroom_id is not None,
            'imageSize': len(image_base64) if isinstance(image_base64, str) else 0,
        }
    )
    # endregion

    if not image_base64:
        return jsonify({'error': '缺少图像数据', 'code': 400}), 400

    students = []
    if classroom_id:
        students = execute_query(
            """SELECT s.id, s.student_number, s.real_name, s.seat_row,
                      s.seat_col, s.face_features
               FROM Students s
               WHERE s.classroom_id = ? AND s.face_registered = 1""",
            (int(classroom_id),)
        )

    students_data = [dict(s) for s in students]
    # region agent log
    _debug_log(
        'pre-fix',
        'H6',
        'face.py:monitoring_analyze:before_process',
        'calling process_frame_for_monitoring',
        {
            'studentsCount': len(students_data),
            'classroomId': str(classroom_id) if classroom_id is not None else None,
        }
    )
    # endregion
    process_start_ms = int(time.time() * 1000)
    result = process_frame_for_monitoring(image_base64, students_data)
    process_elapsed_ms = int(time.time() * 1000) - process_start_ms
    # region agent log
    _debug_log_41bf64(
        'pre-fix',
        'H8',
        'face.py:monitoring_analyze:after_process',
        'monitoring processed',
        {
            'processElapsedMs': process_elapsed_ms,
            'studentsCount': len(students_data),
            'resultFaces': int(result.get('totalFaces', 0)) if isinstance(result, dict) else None,
            'resultHasError': bool(isinstance(result, dict) and result.get('error')),
        }
    )
    # endregion

    return jsonify(result)


@face_bp.route('/compare', methods=['POST'])
def compare_faces():
    data = request.get_json()
    image1 = data.get('image1')
    image2 = data.get('image2')

    if not image1 or not image2:
        return jsonify({'error': '需要两张图像进行比对', 'code': 400}), 400

    features1 = extract_face_features(image1)
    features2 = extract_face_features(image2)

    if features1 is None or features2 is None:
        return jsonify({'error': '其中一张图片未检测到人脸', 'code': 400}), 400

    import numpy as np
    distance = float(np.linalg.norm(np.array(features1) - np.array(features2)))
    threshold = 0.6
    is_same = distance < threshold

    return jsonify({
        'isSamePerson': is_same,
        'distance': round(distance, 4),
        'similarity': round(max(0, (threshold - distance) / threshold), 4),
        'threshold': threshold
    })


@face_bp.route('/stats', methods=['GET'])
def get_stats():
    stats = get_performance_stats()
    return jsonify(stats)


@face_bp.route('/health', methods=['GET'])
def health_check():
    import app.services.face_service as _fs
    if not _fs._init_status:
        _fs._init_cascades()
    return jsonify({
        'status': 'ok',
        'debugSessionMarker': '24509c-face-route',
        'cascade_initialized': _fs._init_status,
        'cascades': {
            'face': _fs._cascade_face is not None,
            'eye': _fs._cascade_eye is not None,
            'profile': _fs._cascade_profile is not None,
            'dnn_face': getattr(_fs, '_dnn_ready', False),
            'yolov10': getattr(_fs, '_yolo_ready', False),
            'pose': getattr(_fs, '_pose_ready', False),
        }
    })


@face_bp.route('/calibration', methods=['GET'])
def get_face_calibration():
    return jsonify({'calibration': get_calibration()})


@face_bp.route('/calibration', methods=['POST'])
def set_face_calibration():
    data = request.get_json() or {}
    return jsonify({'calibration': update_calibration(data)})
