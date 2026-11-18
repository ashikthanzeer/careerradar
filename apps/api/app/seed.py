from sqlalchemy.orm import Session


def seed_database_if_empty(_db: Session) -> None:
    """
    Production mode: No dummy opportunities, fake companies, or demo personas are seeded.
    Users authenticate via Google, LinkedIn, or GitHub and add or sync real opportunities.
    """
    return None
