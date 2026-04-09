from flask import Blueprint, request, jsonify
from datetime import datetime
from app.database import execute_query, execute_one, execute_insert, execute_update
from app.utils.auth import token_required, teacher_required
from app.services.suggestion_service import generate_suggestions, evaluate_suggestion_effect

suggestion_bp = Blueprint('suggestion', __name__)


@suggestion_bp.route('', methods=['GET'])
@token_required
def list_suggestions():
    classroom_id = request.args.get('classroomId')
    session_id = request.args.get('sessionId')
    status_filter = request.args.get('status')

    conditions = []
    params = []

    if classroom_id:
        conditions.append("is.classroom_id = ?")
        params.append(int(classroom_id))
    if session_id:
        conditions.append("is.session_id = ?")
        params.append(session_id)
    if status_filter:
        conditions.append("is.status = ?")
        params.append(status_filter)

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    suggestions = execute_query(
        f"""SELECT is.* FROM InteractionSuggestions is
            WHERE {where_clause}
            ORDER BY is.created_at DESC""",
        tuple(params)
    )

    result = []
    for s in suggestions:
        result.append({
            'id': str(s['id']),
            'sessionId': s['session_id'],
            'classroomId': str(s['classroom_id']),
            'type': s['suggestion_type'],
            'title': s['title'],
            'description': s['description'],
            'durationMinutes': s['duration_minutes'],
            'materials': s['materials'],
            'priority': s['priority'],
            'status': s['status'],
            'triggerCondition': s['trigger_condition'],
            'beforeAttentionRate': float(s['before_attention_rate']) if s['before_attention_rate'] else None,
            'afterAttentionRate': float(s['after_attention_rate']) if s['after_attention_rate'] else None,
            'effect': s['effect'],
            'createdAt': _fmt(s['created_at']),
            'executedAt': _fmt(s['executed_at'])
        })

    return jsonify(result)


@suggestion_bp.route('/generate', methods=['POST'])
@teacher_required
def generate():
    data = request.get_json()
    classroom_id = data.get('classroomId')
    session_id = data.get('sessionId')
    stats = data.get('stats')

    if not stats:
        from app.routes.attention import _get_classroom_summary
        if classroom_id:
            stats = _get_classroom_summary(int(classroom_id))
        else:
            stats = {'avgScore': 5, 'highRate': 30, 'mediumRate': 35, 'lowRate': 35}

    suggestions = generate_suggestions(stats)

    saved_ids = []
    for sug in suggestions:
        sug_id = execute_insert(
            """INSERT INTO InteractionSuggestions
               (session_id, classroom_id, suggestion_type, title, description,
                duration_minutes, materials, trigger_condition, priority, status,
                before_attention_rate)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
            (
                session_id, int(classroom_id) if classroom_id else None,
                sug['type'], sug['title'], sug['description'],
                sug['durationMinutes'], sug['materials'],
                sug['triggerCondition'], sug['priority'],
                stats.get('avgScore', 0)
            )
        )
        saved_ids.append(str(sug_id))
        sug['id'] = str(sug_id)

    return jsonify({
        'suggestions': suggestions,
        'savedIds': saved_ids,
        'count': len(suggestions)
    })


@suggestion_bp.route('/<int:suggestion_id>/execute', methods=['POST'])
@teacher_required
def execute_suggestion(suggestion_id):
    suggestion = execute_one(
        "SELECT * FROM InteractionSuggestions WHERE id = ?",
        (suggestion_id,)
    )
    if not suggestion:
        return jsonify({'error': '建议不存在', 'code': 404}), 404
    if suggestion['status'] != 'pending':
        return jsonify({'error': '该建议已执行或已关闭', 'code': 409}), 409

    execute_update(
        """UPDATE InteractionSuggestions
           SET status = 'executed', executed_by = ?, executed_at = GETDATE()
           WHERE id = ?""",
        (g.current_user['user_id'], suggestion_id)
    )

    return jsonify({'message': '建议已标记为执行'})


@suggestion_bp.route('/<int:suggestion_id>/evaluate', methods=['POST'])
@teacher_required
def evaluate_suggestion(suggestion_id):
    data = request.get_json()
    after_rate = data.get('afterAttentionRate')

    if after_rate is None:
        return jsonify({'error': '缺少 afterAttentionRate 参数', 'code': 400}), 400

    suggestion = execute_one(
        "SELECT * FROM InteractionSuggestions WHERE id = ?",
        (suggestion_id,)
    )
    if not suggestion:
        return jsonify({'error': '建议不存在', 'code': 404}), 404

    before_rate = float(suggestion['before_attention_rate']) if suggestion['before_attention_rate'] else 0
    evaluation = evaluate_suggestion_effect(before_rate, float(after_rate))

    execute_update(
        """UPDATE InteractionSuggestions
           SET status = CASE WHEN ? = 'effective' THEN 'executed' ELSE status END,
               after_attention_rate = ?, effect = ?
           WHERE id = ?""",
        (evaluation['effect'], float(after_rate), evaluation['effect'], suggestion_id)
    )

    return jsonify(evaluation)


@suggestion_bp.route('/<int:suggestion_id>/dismiss', methods=['POST'])
@teacher_required
def dismiss_suggestion(suggestion_id):
    execute_update(
        "UPDATE InteractionSuggestions SET status = 'dismissed' WHERE id = ? AND status = 'pending'",
        (suggestion_id,)
    )
    return jsonify({'message': '建议已关闭'})


def _fmt(dt):
    if dt is None:
        return None
    try:
        return dt.strftime('%Y-%m-%d %H:%M:%S') if hasattr(dt, 'strftime') else str(dt)
    except:
        return str(dt)
