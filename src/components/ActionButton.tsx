import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ActionButtonProps {
  text: string;
  icon: LucideIcon;
  onClick: () => void;
  className?: string;
  primary?: boolean;
  disabled?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  text,
  icon: Icon,
  onClick,
  className = '',
  disabled = false
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center justify-center gap-3 
        py-3 px-6 
        rounded-md 
        text-white font-medium
        transition-all duration-200
        ${disabled ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-lg transform hover:-translate-y-0.5'}
        ${className}
      `}
    >
      <Icon className="w-5 h-5" />
      <span>{text}</span>
    </button>
  );
};

export default ActionButton; 