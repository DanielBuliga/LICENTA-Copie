from __future__ import annotations

from sqlalchemy import func

from app.data.skillbook_seed import SKILL_RENAMES, SKILLBOOK_SEED
from app.db.session import SessionLocal
from app.models.skill import Skill
from app.models.skill_alias import SkillAlias


def normalize(value: str) -> str:
    return " ".join(value.strip().split()).lower()


def main() -> None:
    db = SessionLocal()
    created_skills = 0
    created_aliases = 0
    renamed_skills = 0

    try:
        existing_skills = {
            normalize(name): skill
            for skill, name in db.query(Skill, Skill.name).all()
        }

        for old_name, new_name in SKILL_RENAMES.items():
            old_key = normalize(old_name)
            new_key = normalize(new_name)
            old_skill = existing_skills.get(old_key)
            new_skill = existing_skills.get(new_key)
            if old_skill is None or new_skill is not None:
                continue

            old_skill.name = new_name
            existing_skills.pop(old_key, None)
            existing_skills[new_key] = old_skill
            renamed_skills += 1

        for skill_name, aliases in SKILLBOOK_SEED.items():
            key = normalize(skill_name)
            skill = existing_skills.get(key)

            if skill is None:
                skill = Skill(name=skill_name)
                db.add(skill)
                db.flush()
                existing_skills[key] = skill
                created_skills += 1

            existing_aliases = {
                normalize(alias)
                for (alias,) in db.query(SkillAlias.alias).filter(SkillAlias.skill_id == skill.id).all()
            }

            for alias in aliases:
                alias_value = " ".join(alias.strip().split())
                if not alias_value:
                    continue
                if normalize(alias_value) == normalize(skill.name):
                    continue
                if normalize(alias_value) in existing_aliases:
                    continue

                db.add(SkillAlias(skill_id=skill.id, alias=alias_value))
                existing_aliases.add(normalize(alias_value))
                created_aliases += 1

        db.commit()

        total_skills = db.query(func.count(Skill.id)).scalar() or 0
        total_aliases = db.query(func.count(SkillAlias.id)).scalar() or 0
        print(f"Renamed skills: {renamed_skills}")
        print(f"Created skills: {created_skills}")
        print(f"Created aliases: {created_aliases}")
        print(f"Total skills: {total_skills}")
        print(f"Total aliases: {total_aliases}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
