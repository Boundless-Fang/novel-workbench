import os


CODE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = CODE_DIR

ENV_PATH = os.path.join(PROJECT_ROOT, ".env")
HUGGINGFACE_CACHE_DIR = os.path.join(PROJECT_ROOT, "huggingface", "hub")

REF_DIR = os.path.join(PROJECT_ROOT, "reference_novels")
STYLE_DIR = os.path.join(PROJECT_ROOT, "text_style_imitation")
PROJ_DIR = os.path.join(PROJECT_ROOT, "novel_projects")
DICT_DIR = os.path.join(PROJECT_ROOT, "dictionaries")
TEST_DIR = os.path.join(PROJECT_ROOT, "text_testing_code")

PROJECT_DIRECTORIES = [
    CODE_DIR,
    REF_DIR,
    STYLE_DIR,
    PROJ_DIR,
    DICT_DIR,
    TEST_DIR,
    HUGGINGFACE_CACHE_DIR,
]

for directory in PROJECT_DIRECTORIES:
    os.makedirs(directory, exist_ok=True)
