import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TournamentPage from "./pages/TournamentPage";
import MatchController from "./pages/MatchController";
import Scoreboard from "./pages/Scoreboard";
import Scoreboard2 from "./pages/Scoreboard2";
import Scoreboard3 from "./pages/Scoreboard3";
import Scoreboard4 from "./pages/Scoreboard4";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/tournament/:id" element={<ProtectedRoute><TournamentPage /></ProtectedRoute>} />
            <Route path="/controller/:id" element={<ProtectedRoute><MatchController /></ProtectedRoute>} />
            <Route path="/scoreboard/:id" element={<Scoreboard />} />
            <Route path="/scoreboard2/:id" element={<Scoreboard2 />} />
            <Route path="/scoreboard3/:id" element={<Scoreboard3 />} />
            <Route path="/scoreboard4/:id" element={<Scoreboard4 />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
