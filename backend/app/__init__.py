from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO
import os
import json
import time

from app.config import Config

DEBUG_LOG_PATH = r'D:\专注度\debug-2efedb.log'


def create_app(config_name: str = 'development') -> Flask:
    app = Flask(__name__)
    app.config.from_object(
        __import__('app.config', fromlist=['config_map']).config_map.get(config_name, Config)
    )

    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # region agent log
    def _agent_log(run_id, hypothesis_id, location, message, data):
        with open(DEBUG_LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(json.dumps({
                'sessionId': '2efedb',
                'runId': run_id,
                'hypothesisId': hypothesis_id,
                'location': location,
                'message': message,
                'data': data,
                'timestamp': int(time.time() * 1000),
            }, ensure_ascii=False) + '\n')
    # endregion

    @app.before_request
    def _agent_before_request():
        # region agent log
        _agent_log('pre-fix', 'H3', 'app/__init__.py:before_request', 'incoming request', {
            'method': request.method,
            'path': request.path,
            'remote_addr': request.remote_addr,
            'host': request.host,
        })
        # endregion

    @app.after_request
    def after_request(response):
        origin = request.headers.get('Origin', '*')
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        if request.method == 'OPTIONS':
            response.status_code = 200
        return response

    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

    from app.routes.auth import auth_bp
    from app.routes.classroom import classroom_bp
    from app.routes.student import student_bp
    from app.routes.attention import attention_bp
    from app.routes.face import face_bp
    from app.routes.suggestion import suggestion_bp
    from app.routes.quiz import quiz_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(classroom_bp, url_prefix='/api/classrooms')
    app.register_blueprint(student_bp, url_prefix='/api/students')
    app.register_blueprint(attention_bp, url_prefix='/api/attention')
    app.register_blueprint(face_bp, url_prefix='/api/face')
    app.register_blueprint(suggestion_bp, url_prefix='/api/suggestions')
    app.register_blueprint(quiz_bp, url_prefix='/api/quizzes')

    @app.route('/api/health')
    def health_check():
        return {'status': 'ok', 'message': '课堂专注度分析系统后端运行中'}

    @app.errorhandler(404)
    def not_found(e):
        # region agent log
        _agent_log('pre-fix', 'H4', 'app/__init__.py:not_found', '404 returned', {
            'method': request.method,
            'path': request.path,
        })
        # endregion
        return {'error': '资源不存在', 'code': 404}, 404

    @app.errorhandler(500)
    def server_error(e):
        return {'error': '服务器内部错误', 'code': 500}, 500

    return app, socketio
