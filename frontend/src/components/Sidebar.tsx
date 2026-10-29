import { NavLink } from 'react-router-dom';
import './sidebar.css';

export default function SideBar() {
  return (
    <nav className="sidebar">
      <ul className="sidebar-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li>
          <NavLink to="/" className="sidebar-item">
            <div className="icon-box">
              <img src="/overview.png" alt="Overview" />
            </div>
            <span className="nav-label">Overview</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/chat" className="sidebar-item">
            <div className="icon-box" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2v-5.2A7.5 7.5 0 1 1 20 11.5Z" />
                <path d="M8 11h8M8 14h5" />
              </svg>
            </div>
            <span className="nav-label">AI Chat</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/location" className="sidebar-item">
            <div className="icon-box" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
            </div>
            <span className="nav-label">Location</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}