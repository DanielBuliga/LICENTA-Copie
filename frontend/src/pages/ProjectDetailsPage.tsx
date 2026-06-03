import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { Alert, Box, IconButton, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import IosShareOutlinedIcon from "@mui/icons-material/IosShareOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { DescriptionTab } from "./project/DescriptionTab";
import { DocumentsTab } from "./project/DocumentsTab";
import { ExportTab } from "./project/ExportTab";
import { MembersTab } from "./project/MembersTab";
import { PlanTab } from "./project/PlanTab";
import { ProblemsTab } from "./project/ProblemsTab";
import { ProjectDashboardTab } from "./project/ProjectDashboardTab";
import { TasksTab } from "./project/TasksTab";

type ProjectPublic = { id: number; title: string; description: string | null; created_by: number; created_at: string };

function TabPanel(props: { value: number; index: number; children: React.ReactNode }) {
  if (props.value !== props.index) return null;
  return <Box sx={{ mt: 2 }}>{props.children}</Box>;
}

export function ProjectDetailsPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const [project, setProject] = useState<ProjectPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const loadProject = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<ProjectPublic>(`/projects/${projectId}`);
      setProject(res.data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca proiectul"));
    }
  }, [projectId]);

  useEffect(() => { if (projectId) void loadProject(); }, [loadProject, projectId]);

  const title = project ? project.title : "Project";
  const headerTitle = <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}><IconButton component={RouterLink} to="/projects" aria-label="Înapoi la proiecte"><ArrowBackRoundedIcon /></IconButton><Typography variant="h4">{title}</Typography></Stack>;

  return (
    <AppLayout title={headerTitle}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Box sx={{ mt: 2 }}>
        <ToggleButtonGroup exclusive value={tab} onChange={(_, value) => { if (value !== null) setTab(value); }} sx={{ bgcolor: "background.paper", borderRadius: 2, p: 0.5, border: "1px solid", borderColor: "divider", flexWrap: "wrap", "& .MuiToggleButton-root": { border: 0, borderRadius: 1.5, px: 2, gap: 0.75, fontWeight: 800, color: "text.secondary", "&.Mui-selected": { bgcolor: "background.default", color: "text.primary", boxShadow: "0 4px 14px rgba(15,23,42,0.08)" } } }}>
          <ToggleButton value={0}><DescriptionOutlinedIcon fontSize="small" /> Descriere</ToggleButton>
          <ToggleButton value={1}><DashboardOutlinedIcon fontSize="small" /> Tablou de bord</ToggleButton>
          <ToggleButton value={2}><CheckBoxOutlinedIcon fontSize="small" /> Taskuri</ToggleButton>
          <ToggleButton value={3}><CalendarMonthOutlinedIcon fontSize="small" /> Plan</ToggleButton>
          <ToggleButton value={4}><ReportProblemOutlinedIcon fontSize="small" /> Problems</ToggleButton>
          <ToggleButton value={5}><GroupOutlinedIcon fontSize="small" /> Membrii</ToggleButton>
          <ToggleButton value={6}><FolderCopyOutlinedIcon fontSize="small" /> Documents</ToggleButton>
          <ToggleButton value={7}><IosShareOutlinedIcon fontSize="small" /> Export</ToggleButton>
        </ToggleButtonGroup>
        <TabPanel value={tab} index={0}><DescriptionTab projectId={projectId} description={project?.description ?? null} /></TabPanel>
        <TabPanel value={tab} index={1}><ProjectDashboardTab projectId={projectId} projectTitle={title} /></TabPanel>
        <TabPanel value={tab} index={2}><TasksTab projectId={projectId} /></TabPanel>
        <TabPanel value={tab} index={3}><PlanTab projectId={projectId} /></TabPanel>
        <TabPanel value={tab} index={4}><ProblemsTab projectId={projectId} /></TabPanel>
        <TabPanel value={tab} index={5}><MembersTab projectId={projectId} /></TabPanel>
        <TabPanel value={tab} index={6}><DocumentsTab projectId={projectId} /></TabPanel>
        <TabPanel value={tab} index={7}><ExportTab projectId={projectId} /></TabPanel>
      </Box>
    </AppLayout>
  );
}

