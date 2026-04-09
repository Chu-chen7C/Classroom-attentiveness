import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))


class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')

    DB_SERVER = os.getenv('DB_SERVER', 'YANG')
    DB_DATABASE = os.getenv('DB_DATABASE', 'ClassroomAttention')
    DB_DRIVER = os.getenv('DB_DRIVER', 'ODBC Driver 17 for SQL Server')
    DB_TRUSTED_CONNECTION = os.getenv('DB_TRUSTED_CONNECTION', 'yes')

    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key')
    JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))

    FACE_CASCADE_PATH = os.getenv('FACE_CASCADE_PATH', 'haarcascade_frontalface_default.xml')
    FACE_RECOGNITION_THRESHOLD = float(os.getenv('FACE_RECOGNITION_THRESHOLD', '0.6'))
    FACE_EMBEDDING_DIMENSION = int(os.getenv('FACE_EMBEDDING_DIMENSION', '128'))

    EXPRESSION_WEIGHT = float(os.getenv('EXPRESSION_WEIGHT', '0.55'))
    POSTURE_WEIGHT = float(os.getenv('POSTURE_WEIGHT', '0.45'))

    HIGH_ATTENTION_MIN = int(os.getenv('HIGH_ATTENTION_MIN', '8'))
    MEDIUM_ATTENTION_MIN = int(os.getenv('MEDIUM_ATTENTION_MIN', '5'))

    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002').split(',')

    # Camera scene calibration (onsite defaults)
    CAMERA_DISTANCE_M = float(os.getenv('CAMERA_DISTANCE_M', '10.0'))
    CAMERA_FOV_DEG = float(os.getenv('CAMERA_FOV_DEG', '78.0'))
    RECOG_CALIBRATION_PROFILE = os.getenv('RECOG_CALIBRATION_PROFILE', 'classroom_mid')


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
}
