import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { RequireAuth, RequireAdmin } from './auth.jsx';
import Login from './pages/Login.jsx';
import QueryHub from './pages/QueryHub.jsx';
import ExactMatch from './pages/ExactMatch.jsx';
import Results from './pages/Results.jsx';
import Specifications from './pages/Specifications.jsx';
import Service from './pages/Service.jsx';
import History from './pages/History.jsx';
import Sources from './pages/Sources.jsx';
import Categories from './pages/Categories.jsx';
import Rates from './pages/Rates.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/query" replace />} />
          <Route path="query" element={<QueryHub />} />
          <Route path="query/exact" element={<ExactMatch />} />
          <Route path="query/specs" element={<Specifications />} />
          <Route path="query/service" element={<Service />} />
          <Route path="results" element={<Navigate to="/query" replace />} />
          <Route path="results/:id" element={<Results />} />
          <Route path="history" element={<History />} />
          <Route element={<RequireAdmin />}>
            <Route path="admin/sources" element={<Sources />} />
            <Route path="admin/categories" element={<Categories />} />
            <Route path="admin/rates" element={<Rates />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
