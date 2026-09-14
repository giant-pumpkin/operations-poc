import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import Products from './pages/Products'
import Inventory from './pages/Inventory'
import Stock from './pages/Stock'
import StockIn from './pages/StockIn'
import Movements from './pages/Movements'
import KitAssembly from './pages/KitAssembly'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/products" element={<Products />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/stock-in" element={<StockIn />} />
            <Route path="/movements" element={<Movements />} />
            <Route path="/kit-assembly" element={<KitAssembly />} />
            <Route path="*" element={<Navigate to="/products" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
