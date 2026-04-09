import json
import base64
import qrcode
from io import BytesIO
from flask import Blueprint, request, jsonify, send_file
from app.database import execute_query, execute_one, execute_insert, execute_update
from app.utils.auth import token_required, teacher_required

quiz_bp = Blueprint('quiz', __name__)


@quiz_bp.route('', methods=['GET'])
@token_required
def list_quizzes():
    classroom_id = request.args.get('classroomId')
    status_filter = request.args.get('status')

    conditions = ["q.classroom_id = ?"]
    params = [int(classroom_id)] if classroom_id else []

    if status_filter:
        conditions.append("q.status = ?")
        params.append(status_filter)

    quizzes = execute_query(
        f"""SELECT q.*, u.real_name as creator_name
            FROM Quizzes q
            LEFT JOIN Users u ON u.id = q.created_by
            WHERE {' AND '.join(conditions)}
            ORDER BY q.created_at DESC""",
        tuple(params)
    )

    result = []
    for q in quizzes:
        options = json.loads(q['options']) if isinstance(q['options'], str) else q['options']
        correct_answer = json.loads(q['correct_answer']) if isinstance(q['correct_answer'], str) else q['correct_answer']

        answer_stats = _get_quiz_answer_stats(q['id'])

        result.append({
            'id': str(q['id']),
            'classroomId': str(q['classroom_id']),
            'title': q['title'],
            'type': q['quiz_type'],
            'options': options,
            'correctAnswer': correct_answer,
            'timeLimit': q['time_limit_seconds'],
            'status': q['status'],
            'createdAt': _fmt(q['created_at']),
            'publishedAt': _fmt(q['published_at']),
            'endedAt': _fmt(q['ended_at']),
            'creatorName': q['creator_name'],
            **answer_stats
        })

    return jsonify(result)


@quiz_bp.route('', methods=['POST'])
@teacher_required
def create_quiz():
    data = request.get_json()
    required_fields = ['classroomId', 'title', 'type', 'options', 'correctAnswer']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'{field} 不能为空', 'code': 400}), 400

    options_json = json.dumps(data['options'], ensure_ascii=False)
    answer_json = json.dumps(data['correctAnswer'], ensure_ascii=False)

    quiz_id = execute_insert(
        """INSERT INTO Quizzes (classroom_id, title, quiz_type, options, correct_answer,
                                time_limit_seconds, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)""",
        (
            int(data['classroomId']), data['title'].strip(),
            data['type'], options_json, answer_json,
            int(data.get('timeLimit', 60)), g.current_user['user_id']
        )
    )

    return jsonify({'id': str(quiz_id), 'message': '题目创建成功'}), 201


@quiz_bp.route('/<int:quiz_id>', methods=['PUT'])
@teacher_required
def update_quiz(quiz_id):
    data = request.get_json()
    quiz = execute_one("SELECT * FROM Quizzes WHERE id = ?", (quiz_id,))
    if not quiz:
        return jsonify({'error': '题目不存在', 'code': 404}), 404
    if quiz['status'] == 'ended':
        return jsonify({'error': '已结束的答题不可修改', 'code': 409}), 409

    updates = []
    params = []
    fields_map = {
        'title': 'title',
        'type': 'quiz_type',
        'options': 'options',
        'correctAnswer': 'correct_answer',
        'timeLimit': 'time_limit_seconds'
    }

    for key, col in fields_map.items():
        if key in data:
            value = data[key]
            if key in ('options', 'correctAnswer'):
                value = json.dumps(value, ensure_ascii=False)
            updates.append(f"{col} = ?")
            params.append(value)

    if updates:
        params.append(quiz_id)
        execute_update(f"UPDATE Quizzes SET {', '.join(updates)} WHERE id = ?", tuple(params))

    return jsonify({'message': '题目更新成功'})


@quiz_bp.route('/<int:quiz_id>/publish', methods=['POST'])
@teacher_required
def publish_quiz(quiz_id):
    quiz = execute_one("SELECT * FROM Quizzes WHERE id = ?", (quiz_id,))
    if not quiz:
        return jsonify({'error': '题目不存在', 'code': 404}), 404
    if quiz['status'] != 'draft':
        return jsonify({'error': '只有草稿状态的题目可以发布', 'code': 409}), 409

    execute_update(
        "UPDATE Quizzes SET status = 'published', published_at = GETDATE() WHERE id = ?",
        (quiz_id,)
    )

    return jsonify({'message': '题目已发布'})


@quiz_bp.route('/<int:quiz_id>/end', methods=['POST'])
@teacher_required
def end_quiz(quiz_id):
    execute_update(
        "UPDATE Quizzes SET status = 'ended', ended_at = GETDATE() WHERE id = ? AND status = 'published'",
        (quiz_id,)
    )
    return jsonify({'message': '答题已结束'})


@quiz_bp.route('/<int:quiz_id>/delete', methods=['DELETE'])
@teacher_required
def delete_quiz(quiz_id):
    execute_update("DELETE FROM StudentAnswers WHERE quiz_id = ?", (quiz_id,))
    execute_update("DELETE FROM Quizzes WHERE id = ? AND status != 'ended'", (quiz_id,))
    return jsonify({'message': '题目已删除'})


@quiz_bp.route('/<int:quiz_id>/submit', methods=['POST'])
@token_required
def submit_answer(quiz_id):
    data = request.get_json()
    answer = data.get('answer')
    time_spent = data.get('timeSpent', 0)
    student_id = data.get('studentId')

    if not answer or not student_id:
        return jsonify({'error': '缺少必要参数', 'code': 400}), 400

    quiz = execute_one("SELECT * FROM Quizzes WHERE id = ? AND status = 'published'", (quiz_id,))
    if not quiz:
        return jsonify({'error': '题目不存在或未发布', 'code': 404}), 404

    existing = execute_one(
        "SELECT id FROM StudentAnswers WHERE quiz_id = ? AND student_id = ?",
        (quiz_id, int(student_id))
    )
    if existing:
        return jsonify({'error': '您已提交过答案', 'code': 409 }), 409

    correct_answer = json.loads(quiz['correct_answer']) if isinstance(quiz['correct_answer'], str) else quiz['correct_answer']
    quiz_type = quiz['quiz_type']

    if quiz_type == 'single':
        is_correct = answer == correct_answer
    elif quiz_type == 'multiple':
        user_set = set(answer) if isinstance(answer, list) else {answer}
        correct_set = set(correct_answer) if isinstance(correct_answer, list) else {correct_answer}
        is_correct = user_set == correct_set
    else:
        is_correct = False

    answer_id = execute_insert(
        """INSERT INTO StudentAnswers (quiz_id, student_id, answer, is_correct, time_spent_seconds)
           VALUES (?, ?, ?, ?, ?)""",
        (quiz_id, int(student_id),
         json.dumps(answer, ensure_ascii=False) if isinstance(answer, (list, dict)) else str(answer),
         is_correct, int(time_spent))
    )

    return jsonify({
        'id': str(answer_id),
        'isCorrect': is_correct,
        'message': '提交成功'
    })


@quiz_bp.route('/<int:quiz_id>/results', methods=['GET'])
@token_required
def get_results(quiz_id):
    results = execute_query(
        """SELECT sa.*, s.student_number, s.real_name
           FROM StudentAnswers sa
           JOIN Students s ON s.id = sa.student_id
           WHERE sa.quiz_id = ?
           ORDER BY sa.time_spent_seconds ASC""",
        (quiz_id,)
    )

    total = len(results)
    correct_count = sum(1 for r in results if r['is_correct'])

    avg_time = sum(r['time_spent_seconds'] for r in results) / total if total > 0 else 0

    result_list = []
    for i, r in enumerate(results):
        ans = r['answer']
        try:
            ans = json.loads(ans) if isinstance(ans, str) else ans
        except Exception:
            pass
        result_list.append({
            'rank': i + 1,
            'studentId': r['student_number'],
            'name': r['real_name'],
            'answer': ans,
            'isCorrect': bool(r['is_correct']),
            'timeSpent': r['time_spent_seconds'],
            'submittedAt': _fmt(r['submitted_at'])
        })

    return jsonify({
        'totalSubmissions': total,
        'correctCount': correct_count,
        'accuracyRate': round(correct_count / total * 100, 2) if total > 0 else 0,
        'avgTime': round(avg_time, 2),
        'results': result_list
    })


@quiz_bp.route('/<int:quiz_id>/qrcode', methods=['GET'])
@token_required
def get_qrcode(quiz_id):
    quiz = execute_one("SELECT id, title FROM Quizzes WHERE id = ?", (quiz_id,))
    if not quiz:
        return jsonify({'error': '题目不存在', 'code': 404}), 404

    url = f"http://localhost:3000/student/quiz/{quiz_id}"
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)

    return send_file(buf, mimetype='image/png')


def _get_quiz_answer_stats(quiz_id):
    stats = execute_one(
        """SELECT COUNT(*) as total_submissions,
                  SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
                  AVG(time_spent_seconds) as avg_time
           FROM StudentAnswers WHERE quiz_id = ?""",
        (quiz_id,)
    )
    if not stats or stats['total_submissions'] == 0:
        return {'totalSubmissions': 0, 'correctCount': 0, 'accuracyRate': 0}
    return {
        'totalSubmissions': stats['total_submissions'],
        'correctCount': stats['correct_count'],
        'accuracyRate': round(stats['correct_count'] / stats['total_submissions'] * 100, 2)
    }


def _fmt(dt):
    if dt is None:
        return None
    try:
        return dt.strftime('%Y-%m-%d %H:%M:%S') if hasattr(dt, 'strftime') else str(dt)
    except:
        return str(dt)
