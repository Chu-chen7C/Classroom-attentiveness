from flask import Blueprint, request, jsonify, g
from datetime import datetime, timedelta
import uuid
import json
from app.database import execute_query, execute_one, execute_insert, execute_update
from app.utils.auth import token_required, teacher_required
from app.services.attention_service import calculate_attention_score, get_class_attention_summary
from app.services.suggestion_service import generate_suggestions

attention_bp = Blueprint('attention', __name__)

_active_sessions: dict = {}


@attention_bp.route('/session/start', methods=['POST'])
@teacher_required
def start_session():
    data = request.get_json()
    classroom_id = data.get('classroomId')
    if not classroom_id:
        return jsonify({'error': '缺少 classroomId', 'code': 400}), 400

    session_id = f"session_{uuid.uuid4().hex[:12]}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    execute_insert(
        """INSERT INTO ClassSessions (session_id, classroom_id, teacher_id, start_time, status)
           VALUES (?, ?, ?, ?, 'active')""",
        (session_id, int(classroom_id), g.current_user['user_id'], datetime.now())
    )

    _active_sessions[session_id] = {
        'classroomId': int(classroom_id),
        'teacherId': g.current_user['user_id'],
        'startTime': datetime.now().isoformat(),
        'recordsCount': 0
    }

    return jsonify({
        'sessionId': session_id,
        'message': '监控会话已启动'
    })


@attention_bp.route('/session/<session_id>/stop', methods=['POST'])
@teacher_required
def stop_session(session_id):
    session = _active_sessions.get(session_id)
    if not session:
        return jsonify({'error': '会话不存在或已结束', 'code': 404}), 404

    stats = _calculate_session_stats(session_id)

    execute_update(
        """UPDATE ClassSessions
           SET end_time = GETDATE(), status = 'ended',
               total_records = ?, avg_attention_score = ?,
               high_attention_rate = ?, medium_attention_rate = ?, low_attention_rate = ?
           WHERE session_id = ?""",
        (
            stats['totalRecords'], stats['avgScore'],
            stats['highRate'], stats['mediumRate'], stats['lowRate'],
            session_id
        )
    )

    del _active_sessions[session_id]

    return jsonify({
        'message': '会话已停止',
        'summary': stats
    })


@attention_bp.route('/record', methods=['POST'])
@token_required
def record_attention():
    data = request.get_json()
    session_id = data.get('sessionId')
    student_id = data.get('studentId')
    expression_type = data.get('expression')
    posture_type = data.get('posture')

    if not all([session_id, student_id, expression_type, posture_type]):
        return jsonify({'error': '缺少必要参数', 'code': 400}), 400

    score, level = calculate_attention_score(expression_type, posture_type)

    record_id = execute_insert(
        """INSERT INTO AttentionData
           (session_id, classroom_id, student_id, expression_type, expression_score,
            posture_type, posture_score, attention_score, attention_level, confidence, timestamp)
           SELECT ?, c.id, s.id, ?, ?, ?, ?, ?, ?, ?, GETDATE()
           FROM Classrooms c, Students s
           WHERE s.id = ? AND s.classroom_id = c.id""",
        (
            session_id, expression_type, _get_expression_score(expression_type),
            posture_type, _get_posture_score(posture_type),
            round(score, 2), level, data.get('confidence', 0.85),
            int(student_id)
        )
    )

    if session_id in _active_sessions:
        _active_sessions[session_id]['recordsCount'] += 1

    return jsonify({
        'recordId': record_id,
        'score': round(score, 2),
        'level': level
    })


@attention_bp.route('/realtime/<int:classroom_id>', methods=['GET'])
@token_required
def get_realtime_data(classroom_id):
    records = execute_query(
        """SELECT TOP 100 ad.id, s.student_number, s.real_name,
                  ad.expression_type, ad.posture_type,
                  ad.attention_score, ad.attention_level, ad.confidence, ad.timestamp
           FROM AttentionData ad
           JOIN Students s ON s.id = ad.student_id
           WHERE ad.classroom_id = ?
             AND ad.timestamp > DATEADD(minute, -5, GETDATE())
           ORDER BY ad.timestamp DESC""",
        (classroom_id,)
    )

    result = []
    for r in records:
        result.append({
            'id': str(r['id']),
            'studentId': r['student_number'],
            'studentName': r['real_name'],
            'expression': r['expression_type'],
            'posture': r['posture_type'],
            'score': float(r['attention_score']),
            'level': r['attention_level'],
            'confidence': float(r['confidence']) if r['confidence'] else 0,
            'timestamp': _fmt(r['timestamp'])
        })

    summary = _get_classroom_summary(classroom_id)

    return jsonify({
        'records': result[::-1],
        'summary': summary
    })


@attention_bp.route('/history/<int:classroom_id>', methods=['GET'])
@token_required
def get_history(classroom_id):
    days = int(request.args.get('days', 7))
    group_by = request.args.get('groupBy', 'day')

    if group_by == 'day':
        sql = """
            SELECT CAST(ad.timestamp AS DATE) as date_key,
                   COUNT(*) as record_count,
                   AVG(ad.attention_score) as avg_score,
                   SUM(CASE WHEN ad.attention_level = 'high' THEN 1 ELSE 0 END) as high_count,
                   SUM(CASE WHEN ad.attention_level = 'medium' THEN 1 ELSE 0 END) as medium_count,
                   SUM(CASE WHEN ad.attention_level = 'low' THEN 1 ELSE 0 END) as low_count
            FROM AttentionData ad
            WHERE ad.classroom_id = ?
              AND ad.timestamp >= DATEADD(day, -?, GETDATE())
            GROUP BY CAST(ad.timestamp AS DATE)
            ORDER BY date_key
        """
    else:
        sql = """
            SELECT HOUR(ad.timestamp) as hour_key,
                   COUNT(*) as record_count,
                   AVG(ad.attention_score) as avg_score,
                   SUM(CASE WHEN ad.attention_level = 'high' THEN 1 ELSE 0 END) as high_count,
                   SUM(CASE WHEN ad.attention_level = 'medium' THEN 1 ELSE 0 END) as medium_count,
                   SUM(CASE WHEN ad.attention_level = 'low' THEN 1 ELSE 0 END) as low_count
            FROM AttentionData ad
            WHERE ad.classroom_id = ?
              AND ad.timestamp >= DATEADD(day, -?, GETDATE())
            GROUP BY HOUR(ad.timestamp)
            ORDER BY hour_key
        """

    rows = execute_query(sql, (classroom_id, days))

    result = []
    for row in rows:
        total = row['high_count'] + row['medium_count'] + row['low_count']
        result.append({
            'date': _fmt(row['date_key']) if group_by == 'day' else str(row['hour_key']).zfill(2) + ':00',
            'recordCount': row['record_count'],
            'avgScore': round(float(row['avg_score']), 2) if row['avg_score'] else 0,
            'highCount': row['high_count'],
            'mediumCount': row['medium_count'],
            'lowCount': row['low_count'],
            'highRate': round(float(row['high_count']) / total * 100, 2) if total > 0 else 0,
            'mediumRate': round(float(row['medium_count']) / total * 100, 2) if total > 0 else 0,
            'lowRate': round(float(row['low_count']) / total * 100, 2) if total > 0 else 0
        })

    return jsonify(result)


@attention_bp.route('/<int:classroom_id>/rankings', methods=['GET'])
@token_required
def get_rankings(classroom_id):
    rows = execute_query(
        """SELECT s.student_number, s.real_name,
                  AVG(ad.attention_score) as avg_score,
                  COUNT(*) as total_records,
                  SUM(CASE WHEN ad.attention_level = 'high' THEN 1 ELSE 0 END) as high_count
           FROM AttentionData ad
           JOIN Students s ON s.id = ad.student_id
           WHERE ad.classroom_id = ?
           GROUP BY s.student_number, s.real_name
           ORDER BY avg_score DESC""",
        (classroom_id,)
    )

    result = []
    for i, row in enumerate(rows):
        result.append({
            'rank': i + 1,
            'studentId': row['student_number'],
            'name': row['real_name'],
            'avgScore': round(float(row['avg_score']), 2) if row['avg_score'] else 0,
            'totalRecords': row['total_records'],
            'highCount': row['high_count']
        })

    return jsonify(result)


@attention_bp.route('/timeline', methods=['GET'])
@token_required
def get_attention_timeline():
    classroom_id = request.args.get('classroomId', type=int)
    student_id = request.args.get('studentId', type=int)
    days = int(request.args.get('days', 7))

    if not classroom_id:
        return jsonify({'error': '缺少 classroomId 参数', 'code': 400}), 400

    conditions = ['classroom_id = ?']
    params: list = [classroom_id]

    if student_id:
        conditions.append('student_id = ?')
        params.append(student_id)

    conditions.append("start_time >= DATEADD(day, -?, GETDATE())")
    params.append(days)

    where_clause = ' AND '.join(conditions)

    rows = execute_query(
        f"""SELECT id, student_id, state_type, attention_score,
                   start_time, end_time, duration_seconds, state_details
            FROM AttentionStateTimeline
            WHERE {where_clause}
            ORDER BY start_time DESC""",
        tuple(params)
    )

    result = []
    for row in rows:
        student_info = None
        if row['student_id']:
            stu = execute_one(
                "SELECT real_name, student_number FROM Students WHERE id = ?",
                (row['student_id'],)
            )
            if stu:
                student_info = {
                    'id': str(row['student_id']),
                    'name': stu['real_name'],
                    'studentNumber': stu['student_number']
                }

        result.append({
            'id': str(row['id']),
            'stateType': row['state_type'],
            'attentionScore': float(row['attention_score']) if row['attention_score'] else 0,
            'startTime': _fmt(row['start_time']),
            'endTime': _fmt(row['end_time']),
            'durationSeconds': row['duration_seconds'] or 0,
            'stateDetails': row['state_details'],
            'student': student_info
        })

    summary = _get_timeline_summary(classroom_id, student_id, days)

    return jsonify({
        'records': result,
        'summary': summary,
        'totalRecords': len(result)
    })


@attention_bp.route('/save-record', methods=['POST'])
@teacher_required
def save_detection_record():
    data = request.get_json()
    classroom_id = data.get('classroomId')
    session_id = data.get('sessionId')
    faces = data.get('faces', [])

    if not faces or len(faces) == 0:
        return jsonify({'message': '无检测数据需要保存', 'savedCount': 0})

    saved_count = 0

    for face in faces:
        student_id = face.get('studentId')
        
        if not student_id:
            continue

        is_registered = face.get('isRegistered', False)
        if not is_registered:
            continue

        state_type = face.get('state', 'looking_forward')
        attention_score = face.get('attentionScore', 5.0)
        state_details = face.get('stateDetails', '')

        try:
            record_id = execute_insert(
                """INSERT INTO AttentionStateTimeline 
                   (classroom_id, student_id, session_id, state_type, 
                    attention_score, start_time, state_details)
                   VALUES (?, ?, ?, ?, ?, GETDATE(), ?)""",
                (
                    int(classroom_id) if classroom_id else None,
                    int(student_id),
                    session_id,
                    state_type,
                    round(float(attention_score), 2),
                    state_details
                )
            )
            
            if record_id:
                saved_count += 1
                
        except Exception as e:
            print(f"[Attention] 保存记录失败 (学生{student_id}): {e}")
            continue

    return jsonify({
        'message': f'成功保存 {saved_count} 条检测记录',
        'savedCount': saved_count,
        'totalCount': len(faces)
    })


@attention_bp.route('/review/<int:classroom_id>', methods=['GET'])
@token_required
def review_history(classroom_id):
    days = int(request.args.get('days', 30))

    sessions = execute_query(
        """SELECT cs.id, cs.session_id, cs.classroom_id, c.name as classroom_name,
                  cs.start_time, cs.end_time, cs.status,
                  cs.total_records, cs.avg_attention_score,
                  cs.high_attention_rate, cs.medium_attention_rate, cs.low_attention_rate
           FROM ClassSessions cs
           JOIN Classrooms c ON c.id = cs.classroom_id
           WHERE cs.classroom_id = ?
             AND cs.start_time >= DATEADD(day, -?, GETDATE())
           ORDER BY cs.start_time DESC""",
        (classroom_id, days)
    )

    session_list = []
    for s in sessions:
        students_data = execute_query(
            """SELECT s.student_number, s.real_name,
                      AVG(tl.attention_score) as avg_score,
                      COUNT(*) as record_count,
                      SUM(CASE WHEN tl.attention_score >= 7 THEN 1 ELSE 0 END) as high_count,
                      SUM(CASE WHEN tl.attention_score >= 4 AND tl.attention_score < 7 THEN 1 ELSE 0 END) as medium_count,
                      SUM(CASE WHEN tl.attention_score < 4 THEN 1 ELSE 0 END) as low_count
               FROM AttentionStateTimeline tl
               JOIN Students s ON s.id = tl.student_id
               WHERE tl.session_id = ?
                 OR (tl.classroom_id = ? 
                     AND tl.start_time >= ? 
                     AND (tl.end_time IS NULL OR tl.end_time <= ?))
               GROUP BY s.student_number, s.real_name
               ORDER BY avg_score DESC""",
            (s['session_id'], classroom_id, s['start_time'], s['end_time'])
        )

        timeline_data = execute_query(
            """SELECT tl.state_type, tl.attention_score, tl.start_time, tl.end_time,
                      tl.duration_seconds, tl.state_details, s.real_name
               FROM AttentionStateTimeline tl
               JOIN Students s ON s.id = tl.student_id
               WHERE (tl.session_id = ? 
                      OR (tl.classroom_id = ? 
                          AND tl.start_time >= ? 
                          AND (tl.end_time IS NULL OR tl.end_time <= ?)))
               ORDER BY tl.start_time ASC""",
            (s['session_id'], classroom_id, s['start_time'], s['end_time'])
        )

        session_list.append({
            'id': str(s['id']),
            'sessionId': s['session_id'],
            'classroomName': s['classroom_name'],
            'startTime': _fmt(s['start_time']),
            'endTime': _fmt(s['end_time']),
            'status': s['status'],
            'totalRecords': s['total_records'],
            'avgScore': round(float(s['avg_attention_score']), 2) if s['avg_attention_score'] else 0,
            'highRate': round(float(s['high_attention_rate']), 2) if s['high_attention_rate'] else 0,
            'mediumRate': round(float(s['medium_attention_rate']), 2) if s['medium_attention_rate'] else 0,
            'lowRate': round(float(s['low_attention_rate']), 2) if s['low_attention_rate'] else 0,
            'students': [dict(sd) for sd in students_data],
            'timeline': [dict(t) for t in timeline_data]
        })

    overall_stats = _get_overall_classroom_stats(classroom_id, days)

    return jsonify({
        'sessions': session_list,
        'totalSessions': len(session_list),
        'overallStats': overall_stats
    })


def _calculate_session_stats(session_id):
    stats = execute_one(
        """SELECT COUNT(*) as total_records,
                  AVG(attention_score) as avg_score,
                  SUM(CASE WHEN attention_level = 'high' THEN 1 ELSE 0 END) * 100.0 /
                      NULLIF(COUNT(*), 0) as high_rate,
                  SUM(CASE WHEN attention_level = 'medium' THEN 1 ELSE 0 END) * 100.0 /
                      NULLIF(COUNT(*), 0) as medium_rate,
                  SUM(CASE WHEN attention_level = 'low' THEN 1 ELSE 0 END) * 100.0 /
                      NULLIF(COUNT(*), 0) as low_rate
           FROM AttentionData WHERE session_id = ?""",
        (session_id,)
    )
    return {
        'totalRecords': stats['total_records'],
        'avgScore': round(float(stats['avg_score']), 2) if stats['avg_score'] else 0,
        'highRate': round(float(stats['high_rate']), 2) if stats['high_rate'] else 0,
        'mediumRate': round(float(stats['medium_rate']), 2) if stats['medium_rate'] else 0,
        'lowRate': round(float(stats['low_rate']), 2) if stats['low_rate'] else 0
    }


def _get_classroom_summary(classroom_id):
    stats = execute_one(
        """SELECT COUNT(*) as total_students_with_data,
                  AVG(attention_score) as avg_score,
                  SUM(CASE WHEN attention_level = 'high' THEN 1 ELSE 0 END) as high_count,
                  SUM(CASE WHEN attention_level = 'medium' THEN 1 ELSE 0 END) as medium_count,
                  SUM(CASE WHEN attention_level = 'low' THEN 1 ELSE 0 END) as low_count
           FROM (SELECT DISTINCT student_id, attention_score, attention_level
                 FROM AttentionData WHERE classroom_id = ?
                   AND timestamp > DATEADD(minute, -5, GETDATE())) t""",
        (classroom_id,)
    )
    if not stats or stats['total_students_with_data'] == 0:
        return {'totalStudents': 0, 'avgScore': 0, 'highRate': 0, 'mediumRate': 0, 'lowRate': 0}
    total = stats['high_count'] + stats['medium_count'] + stats['low_count']
    return {
        'totalStudents': stats['total_students_with_data'],
        'avgScore': round(float(stats['avg_score']), 2) if stats['avg_score'] else 0,
        'highRate': round(float(stats['high_count']) / total * 100, 2) if total > 0 else 0,
        'mediumRate': round(float(stats['medium_count']) / total * 100, 2) if total > 0 else 0,
        'lowRate': round(float(stats['low_count']) / total * 100, 2) if total > 0 else 0
    }


_EXPRESSION_SCORES = {
    'forward': 9, 'smile': 8.5, 'mouth_open': 6,
    'frown': 3, 'eyes_closed': 2, 'head_down': 1
}

_POSTURE_SCORES = {
    'forward_sitting': 9, 'turn_side': 6,
    'obvious_side': 3, 'lie_on_desk': 1
}


def _get_expression_score(expr):
    return _EXPRESSION_SCORES.get(expr, 5)


def _get_posture_score(posture):
    return _POSTURE_SCORES.get(posture, 5)


def _fmt(dt):
    if dt is None:
        return None
    try:
        return dt.strftime('%Y-%m-%d %H:%M:%S') if hasattr(dt, 'strftime') else str(dt)
    except:
        return str(dt)


def _get_timeline_summary(classroom_id: int, student_id=None, days=7):
    conditions = ['classroom_id = ?']
    params: list = [classroom_id]

    if student_id:
        conditions.append('student_id = ?')
        params.append(student_id)

    conditions.append("start_time >= DATEADD(day, -?, GETDATE())")
    params.append(days)

    where_clause = ' AND '.join(conditions)

    stats = execute_one(
        f"""SELECT COUNT(*) as total_records,
                  AVG(attention_score) as avg_score,
                  SUM(CASE WHEN attention_score >= 7 THEN 1 ELSE 0 END) * 100.0 /
                      NULLIF(COUNT(*), 0) as high_rate,
                  SUM(CASE WHEN attention_score >= 4 AND attention_score < 7 THEN 1 ELSE 0 END) * 100.0 /
                      NULLIF(COUNT(*), 0) as medium_rate,
                  SUM(CASE WHEN attention_score < 4 THEN 1 ELSE 0 END) * 100.0 /
                      NULLIF(COUNT(*), 0) as low_rate
           FROM AttentionStateTimeline
           WHERE {where_clause}""",
        tuple(params)
    )

    state_distribution = execute_query(
        f"""SELECT state_type, COUNT(*) as count,
                  AVG(attention_score) as avg_score
           FROM AttentionStateTimeline
           WHERE {where_clause}
           GROUP BY state_type
           ORDER BY count DESC""",
        tuple(params)
    )

    return {
        'totalRecords': stats['total_records'] if stats else 0,
        'avgScore': round(float(stats['avg_score']), 2) if stats and stats['avg_score'] else 0,
        'highRate': round(float(stats['high_rate']), 2) if stats and stats['high_rate'] else 0,
        'mediumRate': round(float(stats['medium_rate']), 2) if stats and stats['medium_rate'] else 0,
        'lowRate': round(float(stats['low_rate']), 2) if stats and stats['low_rate'] else 0,
        'stateDistribution': [
            {'stateType': s['state_type'], 'count': s['count'], 'avgScore': round(float(s['avg_score']), 2)}
            for s in state_distribution
        ]
    }


def _get_overall_classroom_stats(classroom_id: int, days=30):
    sessions_count = execute_one(
        """SELECT COUNT(*) as total_sessions
           FROM ClassSessions
           WHERE classroom_id = ?
             AND start_time >= DATEADD(day, -?, GETDATE())""",
        (classroom_id, days)
    )

    timeline_summary = execute_one(
        """SELECT COUNT(*) as total_records,
                  AVG(attention_score) as avg_score,
                  COUNT(DISTINCT student_id) as unique_students
           FROM AttentionStateTimeline
           WHERE classroom_id = ?
             AND start_time >= DATEADD(day, -?, GETDATE())""",
        (classroom_id, days)
    )

    top_students = execute_query(
        """SELECT TOP 10 s.student_number, s.real_name,
                 AVG(tl.attention_score) as avg_score,
                 COUNT(*) as record_count
          FROM AttentionStateTimeline tl
          JOIN Students s ON s.id = tl.student_id
          WHERE tl.classroom_id = ?
            AND tl.start_time >= DATEADD(day, -?, GETDATE())
          GROUP BY s.student_number, s.real_name
          ORDER BY avg_score DESC""",
        (classroom_id, days)
    )

    return {
        'totalSessions': sessions_count['total_sessions'] if sessions_count else 0,
        'totalRecords': timeline_summary['total_records'] if timeline_summary else 0,
        'uniqueStudents': timeline_summary['unique_students'] if timeline_summary else 0,
        'overallAvgScore': round(float(timeline_summary['avg_score']), 2) if timeline_summary and timeline_summary['avg_score'] else 0,
        'topStudents': [
            {
                'studentNumber': s['student_number'],
                'name': s['real_name'],
                'avgScore': round(float(s['avg_score']), 2),
                'recordCount': s['record_count']
            }
            for s in top_students
        ]
    }
