from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, engine
from app.core.errors import register_exception_handlers
from app.modules.applications.router import router as applications_router
from app.modules.auth.router import better_auth_router, router as auth_router
from app.modules.discovery.router import router as discovery_router
from app.modules.ingestion.router import router as ingestion_router
from app.modules.ml.router import router as ml_router
from app.modules.profile.router import router as profile_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=(
        "CareerRadar Production API — Google OAuth 2.0 Authentication, "
        "Job Safety & Scam Verification, Skill-Gap Analysis, and Application Tracking."
    ),
    lifespan=lifespan,
)

origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
if "https://careerradar-web.vercel.app" not in origins:
    origins.append("https://careerradar-web.vercel.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_origin_regex=r"^https://.*careerradar.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(better_auth_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
app.include_router(discovery_router, prefix="/api/v1")
app.include_router(applications_router, prefix="/api/v1")
app.include_router(ingestion_router, prefix="/api/v1")
app.include_router(ml_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.version,
        "environment": settings.environment,
    }
