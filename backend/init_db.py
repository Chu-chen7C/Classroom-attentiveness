import pyodbc
import sys
import os

conn_str = 'DRIVER={ODBC Driver 17 for SQL Server};SERVER=YANG;Trusted_Connection=yes'
DB_NAME = 'ClassroomAttention'

print("=" * 50)
print("数据库初始化工具")
print("=" * 50)

try:
    conn = pyodbc.connect(conn_str, autocommit=True)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sys.databases WHERE name = ?", (DB_NAME,))
    if not cursor.fetchone():
        cursor.execute(f'CREATE DATABASE {DB_NAME}')
        print(f"[OK] 数据库 {DB_NAME} 已创建")
    else:
        print(f"[OK] 数据库 {DB_NAME} 已存在")
    conn.close()
except Exception as e:
    print(f"[错误] 数据库操作失败: {e}")
    sys.exit(1)

full_conn_str = f"{conn_str};DATABASE={DB_NAME}"
db_conn = pyodbc.connect(full_conn_str, autocommit=True)
c = db_conn.cursor()

TABLE_DEFS = {
    "Users": """
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Users]') AND type IN (N'U'))
        BEGIN
            CREATE TABLE Users (
                id INT IDENTITY(1,1) PRIMARY KEY,
                username NVARCHAR(50) NOT NULL UNIQUE,
                password_hash NVARCHAR(255) NOT NULL,
                real_name NVARCHAR(50) NOT NULL,
                role NVARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
                email NVARCHAR(100),
                phone NVARCHAR(20),
                teacher_id NVARCHAR(50),
                student_id NVARCHAR(50),
                avatar_url NVARCHAR(500),
                is_active BIT DEFAULT 1,
                created_at DATETIME2 DEFAULT GETDATE(),
                updated_at DATETIME2 DEFAULT GETDATE(),
                last_login DATETIME2
            );
            CREATE INDEX idx_users_username ON Users(username);
            CREATE INDEX idx_users_role ON Users(role);
        END
    """,

    "Classrooms": """
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Classrooms]') AND type IN (N'U'))
        BEGIN
            CREATE TABLE Classrooms (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name NVARCHAR(100) NOT NULL,
                description NVARCHAR(500),
                teacher_id INT NOT NULL,
                student_count INT DEFAULT 0,
                course_type NVARCHAR(50),
                start_time DATETIME2,
                end_time DATETIME2,
                status NVARCHAR(20) DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'ended', 'paused')),
                created_at DATETIME2 DEFAULT GETDATE(),
                updated_at DATETIME2 DEFAULT GETDATE(),
                FOREIGN KEY (teacher_id) REFERENCES Users(id)
            );
            CREATE INDEX idx_classrooms_teacher ON Classrooms(teacher_id);
            CREATE INDEX idx_classrooms_status ON Classrooms(status);
        END
    """,

    "Students": """
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Students]') AND type IN (N'U'))
        BEGIN
            CREATE TABLE Students (
                id INT IDENTITY(1,1) PRIMARY KEY,
                user_id INT,
                classroom_id INT NOT NULL,
                student_number NVARCHAR(50) NOT NULL,
                real_name NVARCHAR(50) NOT NULL,
                seat_row INT,
                seat_col INT,
                face_registered BIT DEFAULT 0,
                face_features VARBINARY(MAX),
                face_image_path NVARCHAR(500),
                join_time DATETIME2 DEFAULT GETDATE(),
                created_at DATETIME2 DEFAULT GETDATE(),
                updated_at DATETIME2 DEFAULT GETDATE(),
                FOREIGN KEY (user_id) REFERENCES Users(id),
                FOREIGN KEY (classroom_id) REFERENCES Classrooms(id)
            );
            CREATE INDEX idx_students_classroom ON Students(classroom_id);
            CREATE INDEX idx_students_student_num ON Students(student_number);
        END
    """,

    "AttentionData": """
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AttentionData]') AND type IN (N'U'))
        BEGIN
            CREATE TABLE AttentionData (
                id BIGINT IDENTITY(1,1) PRIMARY KEY,
                classroom_id INT NOT NULL,
                student_id INT NOT NULL,
                session_id NVARCHAR(100),
                expression_type NVARCHAR(30) NOT NULL,
                expression_score DECIMAL(3,2) DEFAULT 0,
                posture_type NVARCHAR(30) NOT NULL,
                posture_score DECIMAL(3,2) DEFAULT 0,
                attention_score DECIMAL(4,2) NOT NULL,
                attention_level NVARCHAR(10) NOT NULL,
                confidence DECIMAL(4,3),
                timestamp DATETIME2 DEFAULT GETDATE(),
                FOREIGN KEY (classroom_id) REFERENCES Classrooms(id),
                FOREIGN KEY (student_id) REFERENCES Students(id)
            );
            CREATE CLUSTERED INDEX idx_attention_timestamp ON AttentionData(timestamp);
            CREATE INDEX idx_attention_classroom_student ON AttentionData(classroom_id, student_id);
            CREATE INDEX idx_attention_session ON AttentionData(session_id);
            CREATE INDEX idx_attention_level ON AttentionData(attention_level);
        END
    """,

    "ClassSessions": """
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ClassSessions]') AND type IN (N'U'))
        BEGIN
            CREATE TABLE ClassSessions (
                id INT IDENTITY(1,1) PRIMARY KEY,
                session_id NVARCHAR(100) NOT NULL UNIQUE,
                classroom_id INT NOT NULL,
                teacher_id INT NOT NULL,
                start_time DATETIME2 NOT NULL,
                end_time DATETIME2,
                status NVARCHAR(20) DEFAULT 'active',
                total_records INT DEFAULT 0,
                avg_attention_score DECIMAL(4,2),
                high_attention_rate DECIMAL(5,2),
                medium_attention_rate DECIMAL(5,2),
                low_attention_rate DECIMAL(5,2),
                created_at DATETIME2 DEFAULT GETDATE(),
                FOREIGN KEY (classroom_id) REFERENCES Classrooms(id),
                FOREIGN KEY (teacher_id) REFERENCES Users(id)
            );
            CREATE INDEX idx_sessions_classroom ON ClassSessions(classroom_id);
            CREATE INDEX idx_sessions_teacher ON ClassSessions(teacher_id);
        END
    """,

    "InteractionSuggestions": """
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InteractionSuggestions]') AND type IN (N'U'))
        BEGIN
            CREATE TABLE InteractionSuggestions (
                id INT IDENTITY(1,1) PRIMARY KEY,
                session_id NVARCHAR(100),
                classroom_id INT NOT NULL,
                suggestion_type NVARCHAR(30) NOT NULL,
                title NVARCHAR(200) NOT NULL,
                description NVARCHAR(1000),
                duration_minutes INT DEFAULT 5,
                materials NVARCHAR(1000),
                trigger_condition NVARCHAR(500),
                priority NVARCHAR(10) NOT NULL,
                status NVARCHAR(20) DEFAULT 'pending',
                executed_by INT,
                executed_at DATETIME2,
                before_attention_rate DECIMAL(5,2),
                after_attention_rate DECIMAL(5,2),
                effect NVARCHAR(20) DEFAULT 'pending',
                created_at DATETIME2 DEFAULT GETDATE(),
                FOREIGN KEY (session_id) REFERENCES ClassSessions(session_id),
                FOREIGN KEY (classroom_id) REFERENCES Classrooms(id),
                FOREIGN KEY (executed_by) REFERENCES Users(id)
            );
            CREATE INDEX idx_suggestions_session ON InteractionSuggestions(session_id);
            CREATE INDEX idx_suggestions_classroom ON InteractionSuggestions(classroom_id);
        END
    """,

    "Quizzes": """
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Quizzes]') AND type IN (N'U'))
        BEGIN
            CREATE TABLE Quizzes (
                id INT IDENTITY(1,1) PRIMARY KEY,
                classroom_id INT NOT NULL,
                title NVARCHAR(300) NOT NULL,
                quiz_type NVARCHAR(20) NOT NULL,
                options NVARCHAR(MAX) NOT NULL,
                correct_answer NVARCHAR(200) NOT NULL,
                time_limit_seconds INT DEFAULT 60,
                status NVARCHAR(20) DEFAULT 'draft',
                created_by INT,
                published_at DATETIME2,
                ended_at DATETIME2,
                created_at DATETIME2 DEFAULT GETDATE(),
                FOREIGN KEY (classroom_id) REFERENCES Classrooms(id),
                FOREIGN KEY (created_by) REFERENCES Users(id)
            );
            CREATE INDEX idx_quizzes_classroom ON Quizzes(classroom_id);
        END
    """,

    "StudentAnswers": """
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[StudentAnswers]') AND type IN (N'U'))
        BEGIN
            CREATE TABLE StudentAnswers (
                id BIGINT IDENTITY(1,1) PRIMARY KEY,
                quiz_id INT NOT NULL,
                student_id INT NOT NULL,
                answer NVARCHAR(200) NOT NULL,
                is_correct BIT NOT NULL,
                time_spent_seconds INT NOT NULL,
                submitted_at DATETIME2 DEFAULT GETDATE(),
                FOREIGN KEY (quiz_id) REFERENCES Quizzes(id),
                FOREIGN KEY (student_id) REFERENCES Students(id)
            );
            CREATE INDEX idx_answers_quiz ON StudentAnswers(quiz_id);
            CREATE UNIQUE INDEX idx_answers_quiz_student ON StudentAnswers(quiz_id, student_id);
        END
    """,

    "SystemSettings": """
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SystemSettings]') AND type IN (N'U'))
        BEGIN
            CREATE TABLE SystemSettings (
                id INT IDENTITY(1,1) PRIMARY KEY,
                setting_key NVARCHAR(100) NOT NULL UNIQUE,
                setting_value NVARCHAR(1000),
                description NVARCHAR(500),
                updated_at DATETIME2 DEFAULT GETDATE()
            );
        END
    """
}

print("\n[信息] 开始创建表结构...")
success_count = 0
for table_name, sql in TABLE_DEFS.items():
    try:
        c.execute(sql)
        db_conn.commit()
        success_count += 1
        print(f"  [OK] 表 {table_name}")
    except pyodbc.Error as e:
        err_str = str(e).lower()
        if 'exists' in err_str or 'already' in err_str or 'duplicate' in err_str:
            print(f"  [OK] 表 {table_name} (已存在)")
            success_count += 1
        else:
            print(f"  [ERR] 表 {table_name}: {e}")

try:
    c.execute("""
        IF NOT EXISTS (SELECT * FROM Users WHERE username = 'admin')
        INSERT INTO Users (username, password_hash, real_name, role, email)
        VALUES ('admin', 'e10adc3949ba59abbe56e057f20f883e', '管理员', 'teacher', 'admin@classroom.edu')
    """)
    db_conn.commit()
    print("  [OK] 管理员账号 admin/123456 已就绪")
except Exception as e:
    print(f"  [SKIP] 管理员账号: {e}")

db_conn.close()

print("\n" + "=" * 50)
print(f"初始化完成! 成功创建: {success_count}/{len(TABLE_DEFS)} 张表")
print("=" * 50)

if success_count == len(TABLE_DEFS):
    print("\n[成功] 所有数据库对象已就绪，可以启动后端服务!")
else:
    print("\n[警告] 部分表创建失败，请检查上方日志")
