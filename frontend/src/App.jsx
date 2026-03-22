import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from './components/layout/AdminLayout.jsx'
import UserLayout from './components/layout/UserLayout.jsx'
import { CompareProvider } from './context/CompareContext.jsx'
import { PreferenceProvider } from './context/PreferenceContext.jsx'
import GuestLogin from './pages/GuestLogin.jsx'
import Home from './pages/Home.jsx'
import AdminLogin from './pages/admin/AdminLogin.jsx'
import DataSync from './pages/admin/DataSync.jsx'
import ScenicManagement from './pages/admin/ScenicManagement.jsx'
import StrategyConfig from './pages/admin/StrategyConfig.jsx'
import ForecastDashboard from './pages/ForecastDashboard.jsx'
import PropertyDetails from './pages/PropertyDetails.jsx'
import RadarCompare from './pages/RadarCompare.jsx'
import SmartSearch from './pages/SmartSearch.jsx'
import SwipeOnboarding from './pages/SwipeOnboarding.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <PreferenceProvider>
      <CompareProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/guest-login" element={<GuestLogin />} />
        <Route path="/admin/login" element={<AdminLogin />} />

        <Route element={<UserLayout />}>
          <Route path="/onboarding" element={<SwipeOnboarding />} />
          <Route path="/search" element={<SmartSearch />} />
          <Route path="/details/:id" element={<PropertyDetails />} />
          <Route path="/forecast/:id" element={<ForecastDashboard />} />
          <Route path="/compare" element={<RadarCompare />} />
        </Route>

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="sync" replace />} />
          <Route path="sync" element={<DataSync />} />
          <Route path="scenic" element={<ScenicManagement />} />
          <Route path="strategy" element={<StrategyConfig />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </CompareProvider>
      </PreferenceProvider>
    </BrowserRouter>
  )
}
