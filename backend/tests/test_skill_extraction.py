import unittest

from helpers import ProjectDocumentStub, SkillAliasStub, SkillStub, TaskStub, load_service_module

skill_extraction = load_service_module("skill_extraction_under_test", "app/services/skill_extraction_service.py")


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return list(self.rows)


class FakeDb:
    def __init__(self, *, skills=None, aliases=None, documents=None):
        self.skills = skills or []
        self.aliases = aliases or []
        self.documents = documents or []

    def query(self, model):
        name = getattr(model, "__name__", "")
        if name == "SkillAliasStub":
            return FakeQuery(self.aliases)
        if name == "ProjectDocumentStub":
            return FakeQuery(self.documents)
        return FakeQuery([])


def make_task(title: str, description: str = "") -> TaskStub:
    return TaskStub(
        id=1,
        project_id=1,
        title=title,
        description=description,
        parent_task_id=None,
        priority=3,
        estimate_minutes=60,
        deadline=None,
        status="OPEN",
        created_by=1,
    )


class SkillExtractionTests(unittest.TestCase):
    def test_extracts_skill_by_exact_name(self):
        db = FakeDb(skills=[SkillStub(id=1, name="Autentificare")])
        task = make_task("Implementare autentificare", "Flux de login pentru utilizatori.")

        result = skill_extraction.extract_task_skills(db, task)

        self.assertEqual([item["name"] for item in result["suggestions"]], ["Autentificare"])
        self.assertEqual(result["suggestions"][0]["confidence"], 0.95)

    def test_extracts_skill_by_builtin_alias(self):
        db = FakeDb(skills=[SkillStub(id=1, name="REST API")])
        task = make_task("Endpointuri", "Se expun rute rest pentru autentificare.")

        result = skill_extraction.extract_task_skills(db, task)

        self.assertEqual([item["name"] for item in result["suggestions"]], ["REST API"])
        self.assertEqual(result["suggestions"][0]["matched_term"], "rest")

    def test_extracts_skill_by_skillbook_alias(self):
        db = FakeDb(
            skills=[SkillStub(id=1, name="Hash parole")],
            aliases=[SkillAliasStub(skill_id=1, alias="bcrypt")],
        )
        task = make_task("Securizare parole", "Parolele vor fi salvate folosind bcrypt.")

        result = skill_extraction.extract_task_skills(db, task)

        self.assertEqual([item["name"] for item in result["suggestions"]], ["Hash parole"])
        self.assertEqual(result["suggestions"][0]["matched_term"], "bcrypt")

    def test_does_not_extract_skills_absent_from_skillbook(self):
        db = FakeDb(skills=[SkillStub(id=1, name="React")])
        task = make_task("Integrare autentificare", "Se folosesc JWT si bcrypt.")

        result = skill_extraction.extract_task_skills(db, task)

        self.assertEqual(result["suggestions"], [])

    def test_extracts_from_task_document_metadata(self):
        db = FakeDb(
            skills=[SkillStub(id=1, name="ICS Export")],
            documents=[
                ProjectDocumentStub(
                    id=10,
                    project_id=1,
                    task_id=1,
                    file_name="calendar.ics.txt",
                    description="Document despre ICS Export pentru Google Calendar.",
                )
            ],
        )
        task = make_task("Planificare calendar", "")

        result = skill_extraction.extract_task_skills(db, task)

        self.assertEqual(result["document_count"], 1)
        self.assertEqual([item["name"] for item in result["suggestions"]], ["ICS Export"])


if __name__ == "__main__":
    unittest.main()
