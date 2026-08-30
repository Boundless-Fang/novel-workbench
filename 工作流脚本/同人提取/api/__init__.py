# --- File: __init__.py ---
from fastapi import APIRouter

from .routecore import router as core_router
from .routeproject import router as project_router
from .routeworkflow import router as workflow_router

router = APIRouter()

# 将拆分后的子路由挂载到主路由树上
router.include_router(core_router)
router.include_router(project_router)
router.include_router(workflow_router)