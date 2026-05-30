import { NavLink } from 'react-router-dom';
import { Home, Sliders, Film, Settings } from 'lucide-react';

export default function Navigation() {
  const navItems = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/editor/active', label: 'Editor', icon: Sliders },
    { to: '/export/gallery', label: 'Gallery', icon: Film },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg">
      <div className="glass-panel px-6 py-3 rounded-2xl flex items-center justify-around shadow-2xl relative">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1.5 py-1 px-3.5 rounded-xl transition-all duration-300 relative group ${
                isActive
                  ? 'text-brand-purple'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
                <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                {isActive && (
                  <span className="absolute inset-0 bg-brand-purple/10 rounded-xl -z-10 border border-brand-purple/20 blur-[1px]" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
