from flask import Blueprint, request, jsonify
from app.database import execute_query, execute_one, execute_insert, execute_update
from app.utils.auth import hash_password, generate_token

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(force=True)
    if not isinstance(data, dict):
        return jsonify({'error': '无效的请求数据', 'code': 400}), 400
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空', 'code': 400}), 400

    user = execute_one(
        "SELECT id, username, real_name, role, password_hash FROM Users WHERE username = ?",
        (username,)
    )

    if not user or user['password_hash'] != hash_password(password):
        return jsonify({'error': '用户名或密码错误', 'code': 401}), 401

    token = generate_token(user['id'], user['username'], user['role'])

    execute_update(
        "UPDATE Users SET last_login = GETDATE() WHERE id = ?",
        (user['id'],)
    )

    return jsonify({
        'message': '登录成功',
        'token': token,
        'user': {
            'id': str(user['id']),
            'username': user['username'],
            'realName': user['real_name'],
            'role': user['role']
        }
    })


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    required_fields = ['username', 'password', 'realName', 'role']

    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'{field} 不能为空', 'code': 400}), 400

    if data['role'] not in ['teacher', 'student']:
        return jsonify({'error': '角色必须是 teacher 或 student', 'code': 400}), 400

    existing = execute_one(
        "SELECT id FROM Users WHERE username = ?",
        (data['username'].strip(),)
    )
    if existing:
        return jsonify({'error': '用户名已存在', 'code': 409}), 409

    user_id = execute_insert(
        """INSERT INTO Users (username, password_hash, real_name, role, email, phone, student_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            data['username'].strip(),
            hash_password(data['password']),
            data['realName'].strip(),
            data['role'],
            data.get('email', ''),
            data.get('phone', ''),
            data.get('studentId', '')
        )
    )

    token = generate_token(user_id, data['username'], data['role'])

    return jsonify({
        'message': '注册成功',
        'token': token,
        'user': {
            'id': str(user_id),
            'username': data['username'],
            'realName': data['realName'],
            'role': data['role']
        }
    }), 201


@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    from app.utils.auth import decode_token
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': '未提供Token', 'code': 401}), 401

    decoded = decode_token(auth_header.split(' ')[1])
    if 'error' in decoded:
        return jsonify(decoded), 401

    user = execute_one(
        "SELECT id, username, real_name, role, email, phone, avatar_url FROM Users WHERE id = ?",
        (decoded['user_id'],)
    )

    if not user:
        return jsonify({'error': '用户不存在', 'code': 404}), 404

    return jsonify({
        'id': str(user['id']),
        'username': user['username'],
        'realName': user['real_name'],
        'role': user['role'],
        'email': user['email'],
        'phone': user['phone'],
        'avatarUrl': user['avatar_url']
    })
