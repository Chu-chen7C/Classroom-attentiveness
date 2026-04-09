import pyodbc
from typing import Optional, List, Dict, Any
from app.config import Config
import threading


_local_storage = threading.local()


def get_connection_string() -> str:
    return (
        f"DRIVER={{{Config.DB_DRIVER}}};"
        f"SERVER={Config.DB_SERVER};"
        f"DATABASE={Config.DB_DATABASE};"
        f"Trusted_Connection={Config.DB_TRUSTED_CONNECTION};"
    )


def get_connection() -> pyodbc.Connection:
    conn_str = get_connection_string()
    if not hasattr(_local_storage, 'connection') or _local_storage.connection is None:
        _local_storage.connection = pyodbc.connect(conn_str, autocommit=True)
    try:
        _local_storage.connection.execute("SELECT 1")
    except pyodbc.Error:
        _local_storage.connection = pyodbc.connect(conn_str, autocommit=True)
    return _local_storage.connection


def execute_query(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(sql, params)
    columns = [column[0] for column in cursor.description]
    results = [dict(zip(columns, row)) for row in cursor.fetchall()]
    cursor.close()
    return results


def execute_one(sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    results = execute_query(sql, params)
    return results[0] if results else None


def execute_insert(sql: str, params: tuple = ()) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        if sql.strip().upper().startswith('INSERT'):
            output_sql = sql.replace(
                'INSERT INTO',
                'INSERT INTO',
                1
            )
            insert_part, values_part = output_sql.split('VALUES', 1)
            output_sql = f"{insert_part} OUTPUT INSERTED.id VALUES{values_part}"
            cursor.execute(output_sql, params)
            row = cursor.fetchone()
            new_id = row[0] if row and row[0] else 0
        else:
            cursor.execute(sql, params)
            new_id = 0
        conn.commit()
        return int(new_id)
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()


def execute_update(sql: str, params: tuple = ()) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(sql, params)
    rowcount = cursor.rowcount
    cursor.commit()
    cursor.close()
    return rowcount


def execute_raw(sql: str, params: tuple = ()) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(sql, params)
    cursor.commit()
    cursor.close()


def init_database() -> bool:
    try:
        import os
        schema_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'schema.sql')
        if not os.path.exists(schema_path):
            return False
        with open(schema_path, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        statements = [s.strip() for s in sql_content.split(';') if s.strip() and not s.strip().startswith('--')]
        for statement in statements:
            if statement and not statement.upper().startswith('USE ') and 'PRINT' not in statement.upper():
                if 'CREATE DATABASE' in statement.upper():
                    temp_conn_str = (
                        f"DRIVER={{{Config.DB_DRIVER}}};"
                        f"SERVER={Config.DB_SERVER};"
                        f"Trusted_Connection={Config.DB_TRUSTED_CONNECTION};"
                    )
                    temp_conn = pyodbc.connect(temp_conn_str, autocommit=True)
                    temp_conn.cursor().execute(statement)
                    temp_conn.commit()
                    temp_conn.close()
                else:
                    execute_raw(statement)
        return True
    except Exception as e:
        print(f"数据库初始化错误: {e}")
        return False


def test_connection() -> bool:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT @@VERSION")
        version = cursor.fetchone()[0]
        cursor.close()
        print(f"SQL Server 连接成功: {version[:50]}...")
        return True
    except Exception as e:
        print(f"SQL Server 连接失败: {e}")
        return False
