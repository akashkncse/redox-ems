import React from 'react';
import { NavLink } from 'react-router-dom';

export default function SideBar() {
  return (
    <nav>
      <ul className="sidebar-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        <li>
          <NavLink
            to="/"
            end
            style={({ isActive }) => ({
              display: 'block',
              padding: '0.5rem 1rem',
              textDecoration: 'none',
              color: isActive ? '#fff' : '#000',
              backgroundColor: isActive ? '#007bff' : 'transparent',
            })}
          >
            Overview
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}