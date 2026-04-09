import jwt
import hashlib
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, g
from app.config import Config


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def generate_token(user_id: int, username: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'username': username,
        'role': role,
        'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm='HS256')


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return {'error': 'Token已过期'}
    except jwt.InvalidTokenError:
        return {'error': '无效的Token'}


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        if not token:
            return jsonify({'error': '缺少认证Token', 'code': 401}), 401
        decoded = decode_token(token)
        if 'error' in decoded:
            return jsonify(decoded), 401
        g.current_user = decoded
        return f(*args, **kwargs)
    return decorated


def teacher_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        result = token_required(lambda *a, **kw: (None, None))()
        if isinstance(result, tuple) and len(result) == 2 and result[1] == 401:
            return result
        if g.current_user.get('role') != 'teacher':
            return jsonify({'error': '需要教师权限', 'code': 403}), 403
        return f(*args, **kwargs)
    return decorated
