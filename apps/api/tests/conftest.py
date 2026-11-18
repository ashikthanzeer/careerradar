from collections.abc import Generator
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.database import Base, get_db
from app.main import app


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    TestingSessionLocal = sessionmaker(
        bind=test_engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=test_engine)

    with TestingSessionLocal() as session:
        yield session

    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def login_with_oauth(
    client: TestClient,
    provider: str = "google",
    email: str = "alex@example.com",
    display_name: str = "Alex Rivera",
) -> dict[str, str]:
    auth_info = client.get(f"/api/v1/auth/oauth/{provider}/authorize").json()
    res = client.post(
        f"/api/v1/auth/oauth/{provider}/callback",
        json={
            "state": auth_info["state"],
            "email": email,
            "displayName": display_name,
        },
    )
    assert res.status_code == 200
    token = res.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}
