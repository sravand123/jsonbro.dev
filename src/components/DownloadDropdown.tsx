import React, { useState, useRef, useEffect } from 'react';
import { Download, FileJson, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DownloadDropdownProps {
    onDownloadJSON: () => void;
    onDownloadCSV: () => void;
    className?: string;
}

export function DownloadDropdown({ onDownloadJSON, onDownloadCSV, className }: DownloadDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleDownloadJSON = () => {
        onDownloadJSON();
        setIsOpen(false);
    };

    const handleDownloadCSV = () => {
        onDownloadCSV();
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(!isOpen)}
                className={className}
            >
                <Download className="w-4 h-4 3xl:w-5 3xl:h-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7" />
            </Button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="py-1">
                        <button
                            onClick={handleDownloadJSON}
                            className="w-full px-4 py-2 text-sm text-left hover:bg-muted transition-colors flex items-center gap-2"
                        >
                            <FileJson className="w-4 h-4" />
                            <span>Save as JSON</span>
                        </button>
                        <button
                            onClick={handleDownloadCSV}
                            className="w-full px-4 py-2 text-sm text-left hover:bg-muted transition-colors flex items-center gap-2"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>Save as CSV</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
