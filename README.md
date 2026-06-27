# Smart Planner

Smart Planner este o aplicație web pentru planificarea și gestionarea activităților academice, individuale și în echipă. Aplicația permite organizarea proiectelor, taskurilor, membrilor, competențelor, disponibilității, documentelor, mesajelor, notificărilor și planificărilor automate, cu accent pe deadline-uri, priorități, dependențe, progres și risc.

## Tehnologii

### Backend

- Python + FastAPI
- SQLAlchemy 2.0
- Alembic pentru migrații
- MySQL
- JWT authentication
- passlib/bcrypt pentru parole
- Pydantic pentru validarea datelor
- SMTP configurabil pentru notificări email
- pypdf și python-docx pentru extragerea textului din documente

### Frontend

- React + TypeScript + Vite
- Material UI
- React Router
- Axios
- Day.js pentru formatarea datelor
- Local storage pentru token
- Mod luminos/întunecat și personalizare vizuală

## Funcționalități principale

- Autentificare și înregistrare cu JWT.
- Protecție rute și redirect automat la login când tokenul expiră.
- Dashboard general cu progres personal, progres global, taskuri urgente, activitate recentă și diagramă Gantt.
- Proiecte cu membri, roluri, status activ/inactiv, progres și deadline calculat.
- Detalii proiect cu taburi pentru descriere, tablou de bord, taskuri, plan, probleme, membri, istoric, documente și export.
- Taskuri cu titlu, descriere, prioritate, estimare, deadline, părinte, dependențe, responsabili, status și competențe necesare.
- Taskuri părinte folosite ca structură/container pentru subtaskuri, cu agregare de progres, estimare și deadline.
- Activități personale în listă și coloane, cu schimbarea statusului propriu.
- Calendar lunar cu taskuri planificate, panou lateral pentru ziua selectată și export ICS.
- Planificare și replanificare persistentă prin `scheduled_blocks`.
- Disponibilitate săptămânală cu mai multe intervale pe zi și excepții de indisponibilitate.
- Skillbook cu aliasuri, competențe personale și extragere competențe necesare pentru taskuri.
- Upload/download documente la nivel de proiect sau task, cu validare de tip și dimensiune.
- Mesagerie pe proiecte, notificări pentru mesaje noi și indicator de conversații.
- Notificări in-app și email pentru asignări, deadline-uri, blocuri planificate, modificări de plan, membri inactivi și taskuri gata de verificare.
- Istoric proiect pentru evenimente importante: creare proiect, membri, taskuri, asignări, deadline-uri, statusuri, planificări și modificări de disponibilitate care afectează planul.

## Planificare automată

Planificarea este declanșată manual de owner/admin din tabul `Plan`. Aplicația nu modifică planul fără confirmarea utilizatorului.

### Generează plan

Reconstruiește complet planul pentru intervalul ales. Este util când se dorește o reorganizare completă după modificări majore: taskuri noi, deadline-uri schimbate, competențe actualizate, membri adăugați sau disponibilitate modificată.

### Replanifică

Mută doar taskurile cu probleme și păstrează blocurile valide deja stabilite. Este util când planul este în mare parte corect, dar există taskuri întârziate, blocuri ratate, membri inactivi sau asignări automate devenite invalide.

### Algoritmi folosiți

- Sortare topologică pentru respectarea dependențelor dintre taskuri.
- Detectare cicluri în graful de dependențe.
- Greedy scheduling pentru alegerea următorului task și plasarea lui în sloturile disponibile.
- Packing în sloturi libere pentru împărțirea unui task în mai multe blocuri dacă este necesar.
- Calcul sloturi libere pe baza disponibilității săptămânale, excepțiilor și blocurilor deja ocupate.
- Eligibilitate membri pe baza competențelor cerute de task.
- Recalcul status task pe baza statusurilor assignmenturilor.
- Detecție probleme: deadline depășit, lipsă sloturi, membru inactiv, assignment automat neeligibil, muncă planificată ratată.

### Reguli importante

- Taskurile sunt planificate doar înainte de deadline.
- Deadline-ul are prioritate față de prioritate.
- Dependențele sunt respectate înaintea ordonării după deadline/prioritate.
- Prioritatea departajează taskuri cu deadline-uri egale sau apropiate.
- Asignările manuale sunt păstrate.
- Asignările automate pot fi schimbate la replanificare dacă nu mai sunt valide.
- Dacă ownerul alege manual un membru fără competențele necesare, aplicația avertizează și permite o asignare manuală asumată.

## Extragerea competențelor

Extragerea competențelor necesare unui task este bazată pe un skillbook controlat. Aplicația nu inventează skilluri libere, ci caută doar competențe existente în skillbook.

Surse analizate:

- titlul taskului;
- descrierea taskului;
- documentele atașate taskului;
- numele fișierului și descrierea documentului;
- conținut text extras din `.txt`, `.md`, `.pdf` și `.docx`.

Metoda folosită:

- normalizare text: lowercase, eliminare diacritice, curățare punctuație inutilă;
- păstrarea termenilor tehnici precum `C++`, `C#`, `.NET`, `Node.js`;
- matching pe nume skill;
- matching pe aliasuri salvate în baza de date;
- matching pe aliasuri tehnice definite în seed;
- scor de încredere pentru explicație;
- aplicare automată doar pentru potriviri sigure.

## Notificări

Aplicația folosește notificări in-app și, opțional, email.

Tipuri de notificări:

- adăugare în proiect;
- asignare task;
- task modificat;
- deadline schimbat;
- task gata de verificare;
- task închis;
- proiect finalizat;
- mesaje noi;
- deadline apropiat;
- bloc planificat apropiat;
- calendar actualizat;
- modificări de disponibilitate care afectează planul;
- necesitate de verificare/replanificare.

Workerul de notificări rulează în backend și verifică periodic reminder-ele. Dacă backend-ul nu rulează, notificările programate pentru acel interval nu pot fi generate retroactiv.

## Structura proiectului

```text
backend/
  app/
    api/routes/        Endpointuri FastAPI
    models/            Modele SQLAlchemy
    schemas/           Scheme Pydantic
    services/          Logică de business
    utils/             Utilitare comune
  migrations/          Migrații Alembic
  tests/               Teste unitare
  requirements.txt

frontend/
  src/
    api/               Client Axios și erori API
    components/        Componente reutilizabile
    pages/             Pagini principale
    utils/             Utilitare frontend
  package.json
```

## Configurare backend

1. Creează mediul virtual:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
```

2. Instalează dependențele:

```powershell
pip install -r requirements.txt
```

3. Creează fișierul `.env` în `backend/`:

```env
DB_URL=mysql+pymysql://user:password@localhost:3306/licenta_db
JWT_SECRET=schimba_cu_un_secret_lung_de_minim_32_caractere
UPLOAD_DIR=uploads
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=smart-planner@local
SMTP_USE_TLS=true

NOTIFICATION_WORKER_ENABLED=true
NOTIFICATION_WORKER_INTERVAL_SECONDS=600
JWT_EXPIRE_MINUTES=60
```

4. Rulează migrațiile:

```powershell
alembic upgrade head
```

5. Pornește backend-ul:

```powershell
uvicorn app.main:app --reload
```

API-ul va fi disponibil la:

- `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`

## Configurare frontend

1. Instalează dependențele:

```powershell
cd frontend
npm install
```

2. Creează/actualizează `frontend/.env`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

3. Pornește aplicația:

```powershell
npm run dev
```

Frontend-ul va fi disponibil de obicei la:

- `http://localhost:5173`

## Testare

Teste backend:

```powershell
cd backend
python -m unittest discover -s tests
```

Build frontend:

```powershell
cd frontend
npm run build
```

Zone acoperite de testele actuale:

- validări de schemă;
- status task/assignment;
- sortare topologică și detectare cicluri;
- calcul sloturi libere;
- packing în sloturi disponibile;
- planificare cu deadline și replanificare parțială;
- extragere competențe din text și documente;
- sursa asignărilor (`MANUAL`, `AUTO`, `MANUAL_OVERRIDE`).

## Exporturi

- Exportul din tabul `Export` al unui proiect generează fișier ICS pentru proiectul respectiv.
- Exportul din pagina `Calendar` poate include planificarea pe mai multe proiecte.
- Evenimentele exportate includ proiectul, taskul, responsabilul, statusul blocului și statusul taskului.

## Observații de securitate

- `JWT_SECRET` este obligatoriu și trebuie să fie suficient de lung.
- CORS este configurabil prin `.env`.
- Parolele sunt hash-uite cu bcrypt.
- Upload-ul de documente are validare de tip și dimensiune.
- Endpointurile importante verifică rolul utilizatorului în proiect.
- Rate limiting simplu este aplicat pe login/register.

## Limitări și direcții viitoare

- Planificarea folosește o strategie greedy, potrivită pentru un proiect academic și ușor de explicat, dar nu garantează optim global.
- Mesajele proiectelor nu sunt criptate end-to-end.
- Pentru producție reală, workerul de notificări ar trebui mutat într-un sistem dedicat, precum Celery/RQ/APScheduler persistent.
- Pentru proiecte foarte mari, se poate extinde paginarea și pe listele de taskuri, cu atenție la componentele care au nevoie de arborele complet.
- Se pot adăuga teste end-to-end pentru fluxurile principale din interfață.

