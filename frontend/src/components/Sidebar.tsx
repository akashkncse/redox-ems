import { NavLink } from 'react-router-dom';
import './sidebar.css';

export default function SideBar() {
  return (
    <nav className="sidebar">
      <ul className="sidebar-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li>
          <NavLink to="/" className="sidebar-item">
            <div className="icon-box">
              <img src="/web-ui/overview.png" alt="Overview" />
            </div>
            <span className="nav-label">Overview</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/settings" className="sidebar-item">
            <div className="icon-box">
              <img src="/web-ui/settings.png" alt="Settings" />
            </div>
            <span className="nav-label">Settings</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}