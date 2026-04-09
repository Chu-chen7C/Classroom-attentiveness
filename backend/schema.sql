-- ============================================================
-- 课堂专注度智能分析与互动优化系统 - 数据库 Schema
-- 数据库: ClassroomAttention
-- 认证: Windows 身份验证 (YANG)
-- ============================================================

-- 创建数据库（如果不存在）
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'ClassroomAttention')
BEGIN
    CREATE DATABASE ClassroomAttention;
END
GO

USE ClassroomAttention;
GO

-- ========================================
-- 1. 用户表 (Users)
-- ========================================
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
    CREATE INDEX idx_users_teacher_id ON Users(teacher_id);
    CREATE INDEX idx_users_student_id ON Users(student_id);
END
GO

-- ========================================
-- 2. 班级表 (Classrooms)
-- ========================================
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
GO

-- ========================================
-- 3. 学生表 (Students)
-- ========================================
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
    CREATE INDEX idx_students_face_reg ON Students(face_registered);
END
GO

-- ========================================
-- 4. 专注度数据表 (AttentionData)
-- 核心业务表: 存储每条实时采集的专注度数据
-- ========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AttentionData]') AND type IN (N'U'))
BEGIN
    CREATE TABLE AttentionData (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        classroom_id INT NOT NULL,
        student_id INT NOT NULL,
        session_id NVARCHAR(100),

        -- 表情识别结果 (6类)
        expression_type NVARCHAR(30) NOT NULL CHECK (
            expression_type IN ('forward', 'head_down', 'eyes_closed', 'frown', 'mouth_open', 'smile')
        ),
        expression_score DECIMAL(3,2) DEFAULT 0,

        -- 姿态识别结果 (4类)
        posture_type NVARCHAR(30) NOT NULL CHECK (
            posture_type IN ('forward_sitting', 'turn_side', 'obvious_side', 'lie_on_desk')
        ),
        posture_score DECIMAL(3,2) DEFAULT 0,

        -- 加权计算结果
        attention_score DECIMAL(4,2) NOT NULL,
        attention_level NVARCHAR(10) NOT NULL CHECK (
            attention_level IN ('high', 'medium', 'low')
        ),

        -- 置信度
        confidence DECIMAL(4,3),

        timestamp DATETIME2 DEFAULT GETDATE(),

        FOREIGN KEY (classroom_id) REFERENCES Classrooms(id),
        FOREIGN KEY (student_id) REFERENCES Students(id)
    );

    -- 关键查询索引: 按时间+班级+学生
    CLUSTERED INDEX idx_attention_timestamp ON AttentionData(timestamp);
    CREATE INDEX idx_attention_classroom_student ON AttentionData(classroom_id, student_id);
    CREATE INDEX idx_attention_session ON AttentionData(session_id);
    CREATE INDEX idx_attention_level ON AttentionData(attention_level);
    CREATE INDEX idx_attention_timestamp_range ON AttentionData(timestamp, classroom_id);
END
GO

-- ========================================
-- 5. 课堂会话表 (ClassSessions)
-- 每次上课的唯一会话记录
-- ========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ClassSessions]') AND type IN (N'U'))
BEGIN
    CREATE TABLE ClassSessions (
        id INT IDENTITY(1,1) PRIMARY KEY,
        session_id NVARCHAR(100) NOT NULL UNIQUE,
        classroom_id INT NOT NULL,
        teacher_id INT NOT NULL,
        start_time DATETIME2 NOT NULL,
        end_time DATETIME2,
        status NVARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'ended')),

        -- 会话统计摘要
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
    CREATE INDEX idx_sessions_status ON ClassSessions(status);
END
GO

-- ========================================
-- 6. 专注状态时间记录表 (AttentionStateTimeline)
-- 新增: 记录每个学生在不同时间段的专注状态变化
-- 用于历史复盘功能，显示状态变化的时间段
-- ========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AttentionStateTimeline]') AND type IN (N'U'))
BEGIN
    CREATE TABLE AttentionStateTimeline (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        classroom_id INT NOT NULL,
        student_id INT NOT NULL,
        session_id NVARCHAR(100),

        -- 专注状态类型
        state_type NVARCHAR(30) NOT NULL CHECK (
            state_type IN (
                'looking_forward',    -- 正常注视前方
                'looking_left',       -- 向左看
                'looking_right',      -- 向右看
                'head_down',         -- 低头
                'eyes_closed',       -- 闭眼
                'frowning',          -- 皱眉
                'mouth_open',        -- 张嘴
                'low_light'         -- 光线不足
            )
        ),

        -- 专注度分数
        attention_score DECIMAL(4,2) NOT NULL,

        -- 时间段信息
        start_time DATETIME2 NOT NULL,
        end_time DATETIME2,
        duration_seconds INT DEFAULT 0,

        -- 状态详情
        state_details NVARCHAR(200),

        -- 时间戳
        created_at DATETIME2 DEFAULT GETDATE(),

        FOREIGN KEY (classroom_id) REFERENCES Classrooms(id),
        FOREIGN KEY (student_id) REFERENCES Students(id)
    );

    -- 关键索引: 按学生+时间查询
    CLUSTERED INDEX idx_timeline_student_time ON AttentionStateTimeline(student_id, start_time);
    CREATE INDEX idx_timeline_classroom ON AttentionStateTimeline(classroom_id);
    CREATE INDEX idx_timeline_session ON AttentionStateTimeline(session_id);
    CREATE INDEX idx_timeline_state_type ON AttentionStateTimeline(state_type);
END
GO

-- ========================================
-- 7. 互动建议表 (InteractionSuggestions)
-- ========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InteractionSuggestions]') AND type IN (N'U'))
BEGIN
    CREATE TABLE InteractionSuggestions (
        id INT IDENTITY(1,1) PRIMARY KEY,
        session_id NVARCHAR(100),
        classroom_id INT NOT NULL,

        suggestion_type NVARCHAR(30) NOT NULL CHECK (
            suggestion_type IN ('group_discussion', 'targeted_question', 'thinking_question', 'break')
        ),
        title NVARCHAR(200) NOT NULL,
        description NVARCHAR(1000),
        duration_minutes INT DEFAULT 5,
        materials NVARCHAR(1000),
        trigger_condition NVARCHAR(500),
        priority NVARCHAR(10) NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),

        status NVARCHAR(20) DEFAULT 'pending' CHECK (
            status IN ('pending', 'executed', 'dismissed', 'expired')
        ),

        -- 执行信息
        executed_by INT,
        executed_at DATETIME2,

        -- 效果评估
        before_attention_rate DECIMAL(5,2),
        after_attention_rate DECIMAL(5,2),
        effect NVARCHAR(20) CHECK (effect IN ('effective', 'ineffective', 'pending')) DEFAULT 'pending',

        created_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (session_id) REFERENCES ClassSessions(session_id),
        FOREIGN KEY (classroom_id) REFERENCES Classrooms(id),
        FOREIGN KEY (executed_by) REFERENCES Users(id)
    );

    CREATE INDEX idx_suggestions_session ON InteractionSuggestions(session_id);
    CREATE INDEX idx_suggestions_classroom ON InteractionSuggestions(classroom_id);
    CREATE INDEX idx_suggestions_priority ON InteractionSuggestions(priority);
    CREATE INDEX idx_suggestions_status ON InteractionSuggestions(status);
END
GO

-- ========================================
-- 8. 答题题目表 (Quizzes)
-- ========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Quizzes]') AND type IN (N'U'))
BEGIN
    CREATE TABLE Quizzes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        classroom_id INT NOT NULL,
        title NVARCHAR(300) NOT NULL,
        quiz_type NVARCHAR(20) NOT NULL CHECK (quiz_type IN ('single', 'multiple')),
        options NVARCHAR(MAX) NOT NULL,
        correct_answer NVARCHAR(200) NOT NULL,
        time_limit_seconds INT DEFAULT 60,
        status NVARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'ended')),
        created_by INT,
        published_at DATETIME2,
        ended_at DATETIME2,
        created_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (classroom_id) REFERENCES Classrooms(id),
        FOREIGN KEY (created_by) REFERENCES Users(id)
    );

    CREATE INDEX idx_quizzes_classroom ON Quizzes(classroom_id);
    CREATE INDEX idx_quizzes_status ON Quizzes(status);
END
GO

-- ========================================
-- 9. 学生答题记录表 (StudentAnswers)
-- ========================================
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
    CREATE INDEX idx_answers_student ON StudentAnswers(student_id);
    CREATE UNIQUE INDEX idx_answers_quiz_student ON StudentAnswers(quiz_id, student_id);
END
GO

-- ========================================
-- 10. 系统设置表 (SystemSettings)
-- ========================================
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
GO

-- ========================================
-- 初始数据: 默认管理员账号
-- 密码为 123456 的 SHA256 hash
-- ========================================
IF NOT EXISTS (SELECT * FROM Users WHERE username = 'admin')
BEGIN
    INSERT INTO Users (username, password_hash, real_name, role, email)
    VALUES ('admin', 'e10adc3949ba59abbe56e057f20f883e', '管理员', 'teacher', 'admin@classroom.edu');
END
GO

PRINT '数据库 Schema 创建完成!';
