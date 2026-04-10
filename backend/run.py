from app import create_app
import os
import json
import time

DEBUG_LOG_PATH = r'D:\专注度\debug-2efedb.log'


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

if __name__ == '__main__':
    env = os.getenv('FLASK_ENV', 'development')
    # region agent log
    _agent_log('pre-fix', 'H1', 'run.py:startup', 'backend process started', {'env': env})
    # endregion
    print("=" * 50)
    print("课堂专注度智能分析系统 - 后端服务")
    print("=" * 50)

    from app.database import test_connection, init_database
    if not test_connection():
        print("\n[错误] 无法连接到 SQL Server 数据库!")
        print("请确认:")
        print("  1. SQL Server 服务已启动")
        print("  2. 服务器名称配置正确 (.env 文件中的 DB_SERVER)")
        print("  3. Windows 身份验证可用")
        exit(1)

    print("\n[成功] 数据库连接正常")

    if os.getenv('INIT_DB') == 'true':
        print("[信息] 正在初始化数据库结构...")
        if init_database():
            print("[成功] 数据库初始化完成")
        else:
            print("[警告] 数据库初始化失败，可能表已存在")

    app, socketio = create_app(env)
    # region agent log
    _agent_log('pre-fix', 'H2', 'run.py:socketio.run', 'starting socketio server', {
        'host': '0.0.0.0',
        'port': 5000,
        'debug': (env == 'development'),
        'use_reloader': False,
    })
    # endregion
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=(env == 'development'),
        use_reloader=False,
    )
