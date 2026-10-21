import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// App chỉ dùng theme sáng của daisyUI. Ghim `data-theme="light"` để trình duyệt
// không tự đổi sang theme tối khi hệ điều hành (máy tính/điện thoại) đang bật
// chế độ sáng tối — daisyUI v5 dùng `@media (prefers-color-scheme: dark)` cho
// `:root:not([data-theme])`, nên chỉ cần có `data-theme` là nền không bị đảo.
document.documentElement.setAttribute('data-theme', 'light')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
