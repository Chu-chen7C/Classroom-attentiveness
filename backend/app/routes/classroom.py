from flask import Blueprint, request, jsonify, g
from datetime import datetime
from app.database import execute_query, execute_one, execute_insert, execute_update
from app.utils.auth import token_required, teacher_required

classroom_bp = Blueprint('classroom', __name__)


@classroom_bp.route('', methods=['GET'])
@token_required
def list_classrooms():
    role = g.current_user['role']
    user_id = g.current_user['user_id']

    if role == 'teacher':
        classrooms = execute_query(
            """SELECT c.id, c.name, c.description, c.student_count, c.course_type,
                      c.start_time, c.end_time, c.status, c.created_at
               FROM Classrooms c
               WHERE c.teacher_id = ?
               ORDER BY c.created_at DESC""",
            (user_id,)
        )
    else:
        classrooms = execute_query(
            """SELECT DISTINCT c.id, c.name, c.description, c.student_count, c.course_type,
                      c.start_time, c.end_time, c.status, c.created_at
               FROM Classrooms c
               JOIN Students s ON s.classroom_id = c.id
               JOIN Users u ON u.id = s.user_id AND u.id = ?
               ORDER BY c.created_at DESC""",
            (user_id,)
        )

    result = []
    for c in classrooms:
        result.append({
            'id': str(c['id']),
            'name': c['name'],
            'description': c['description'],
            'studentCount': c['student_count'],
            'courseType': c['course_type'],
            'startTime': _format_datetime(c['start_time']),
            'endTime': _format_datetime(c['end_time']),
            'status': c['status'],
            'createdAt': _format_datetime(c['created_at'])
        })

    return jsonify(result)


@classroom_bp.route('', methods=['POST'])
@teacher_required
def create_classroom():
    data = request.get_json()
    if not data.get('name'):
        return jsonify({'error': '班级名称不能为空', 'code': 400}), 400

    classroom_id = execute_insert(
        """INSERT INTO Classrooms (name, description, teacher_id, course_type, start_time, status)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            data['name'].strip(),
            data.get('description', ''),
            g.current_user['user_id'],
            data.get('courseType', ''),
            data.get('startTime') or None,
            'ongoing'
        )
    )

    return jsonify({
        'id': str(classroom_id),
        'message': '班级创建成功'
    }), 201


@classroom_bp.route('/<int:classroom_id>', methods=['PUT'])
@teacher_required
def update_classroom(classroom_id):
    data = request.get_json()

    classroom = execute_one("SELECT * FROM Classrooms WHERE id = ?", (classroom_id,))
    if not classroom:
        return jsonify({'error': '班级不存在', 'code': 404}), 404
    if classroom['teacher_id'] != g.current_user['user_id']:
        return jsonify({'error': '无权限操作此班级', 'code': 403}), 403

    updates = []
    params = []
    updatable = {
        'name': 'name', 'description': 'description',
        'courseType': 'course_type', 'status': 'status'
    }

    for key, col in updatable.items():
        if key in data:
            updates.append(f"{col} = ?")
            params.append(data[key])

    if not updates:
        return jsonify({'error': '没有要更新的字段', 'code': 400}), 400

    params.append(classroom_id)
    execute_update(f"UPDATE Classrooms SET {', '.join(updates)}, updated_at = GETDATE() WHERE id = ?", tuple(params))

    return jsonify({'message': '班级信息更新成功'})


@classroom_bp.route('/<int:classroom_id>', methods=['DELETE'])
@teacher_required
def delete_classroom(classroom_id):
    classroom = execute_one("SELECT * FROM Classrooms WHERE id = ?", (classroom_id,))
    if not classroom:
        return jsonify({'error': '班级不存在', 'code': 404}), 404
    if classroom['teacher_id'] != g.current_user['user_id']:
        return jsonify({'error': '无权限删除此班级', 'code': 403}), 403

    execute_update("DELETE FROM Students WHERE classroom_id = ?", (classroom_id,))
    execute_update("DELETE FROM Classrooms WHERE id = ?", (classroom_id,))

    return jsonify({'message': '班级已删除'})


@classroom_bp.route('/stats/overview', methods=['GET'])
@token_required
def get_overview_stats():
    user_id = g.current_user['user_id']

    total_classes = execute_one(
        "SELECT COUNT(*) as cnt FROM Classrooms WHERE teacher_id = ?",
        (user_id,)
    )['cnt']

    total_students = execute_one(
        """SELECT COUNT(*) as cnt FROM Students s
           JOIN Classrooms c ON c.id = s.classroom_id
           WHERE c.teacher_id = ?""",
        (user_id,)
    )['cnt']

    avg_attention = execute_one(
        """SELECT ISNULL(AVG(attention_score), 0) as avg_score FROM AttentionData a
           JOIN Classrooms c ON c.id = a.classroom_id
           WHERE c.teacher_id = ? AND a.timestamp > DATEADD(day, -7, GETDATE())""",
        (user_id,)
    )['avg_score']

    recent_sessions = execute_query(
        """SELECT TOP 5 session_id, start_time, status, avg_attention_score
           FROM ClassSessions
           WHERE teacher_id = ?
           ORDER BY start_time DESC""",
        (user_id,)
    )

    high_rate = execute_one(
        """SELECT ISNULL(COUNT(DISTINCT student_id) * 100.0 /
              NULLIF((SELECT COUNT(DISTINCT student_id) FROM AttentionData a2
                     JOIN Classrooms c2 ON c2.id = a2.classroom_id
                     WHERE c2.teacher_id = ? AND a2.timestamp > DATEADD(day, -7, GETDATE())), 0), 0) as rate
           FROM AttentionData a
           JOIN Classrooms c ON c.id = a.classroom_id
           WHERE c.teacher_id = ? AND attention_level = 'high'
             AND a.timestamp > DATEADD(day, -7, GETDATE())""",
        (user_id, user_id)
    )['rate']

    return jsonify({
        'totalClasses': total_classes,
        'totalStudents': total_students,
        'avgAttentionScore': round(float(avg_attention), 2) if avg_attention else 0,
        'highAttentionRate': round(float(high_rate), 2) if high_rate else 0,
        'recentSessions': [{
            'sessionId': r['session_id'],
            'startTime': _format_datetime(r['start_time']),
            'status': r['status'],
            'avgAttentionScore': float(r['avg_attention_score']) if r['avg_attention_score'] else 0
        } for r in recent_sessions]
    })


def _format_datetime(dt):
    if dt is None:
        return None
    try:
        return dt.strftime('%Y-%m-%d %H:%M:%S') if hasattr(dt, 'strftime') else str(dt)
    except:
        return str(dt)
