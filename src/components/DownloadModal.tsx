import React, { useState, useEffect, useRef } from 'react';
import { X, FileJson, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DownloadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDownload: (filename: string, format: 'json' | 'csv') => void;
    defaultFilename?: string;
}

export function DownloadModal({ isOpen, onClose, onDownload, defaultFilename = 'formatted' }: DownloadModalProps) {
    const [filename, setFilename] = useState(defaultFilename);
    const [format, setFormat] = useState<'json' | 'csv'>('json');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setFilename(defaultFilename);
            setFormat('json');
            // Focus the input after a short delay to ensure modal is rendered
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 100);
        }
    }, [isOpen, defaultFilename]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        const handleEnter = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && isOpen && filename.trim()) {
                handleDownload();
            }
        };

        document.addEventListener('keydown', handleEscape);
        document.addEventListener('keydown', handleEnter);

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('keydown', handleEnter);
        };
    }, [isOpen, filename, format]);

    const handleDownload = () => {
        if (filename.trim()) {
            onDownload(filename.trim(), format);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-150 ease-out"
                style={{ opacity: isOpen ? 1 : 0 }}
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm transition-all duration-150 ease-out"
                style={{
                    opacity: isOpen ? 1 : 0,
                    transform: `translate(-50%, -50%) scale(${isOpen ? 1 : 0.95})`
                }}
            >
                <div className="bg-background border border-border rounded-lg shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <h2 className="text-sm font-medium">Save File</h2>
                        <button
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted p-0.5"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="px-4 py-3 space-y-3">
                        {/* Filename Input */}
                        <div className="space-y-1.5">
                            <label htmlFor="filename" className="text-xs font-medium text-muted-foreground">
                                Filename
                            </label>
                            <Input
                                ref={inputRef}
                                id="filename"
                                type="text"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                placeholder="Enter filename"
                                className="w-full h-8 text-sm"
                            />
                        </div>

                        {/* Format Selection */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Format</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setFormat('json')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border transition-all text-sm ${format === 'json'
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border hover:border-primary/50 hover:bg-muted'
                                        }`}
                                >
                                    <FileJson className="w-4 h-4" />
                                    <span>JSON</span>
                                </button>
                                <button
                                    onClick={() => setFormat('csv')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border transition-all text-sm ${format === 'csv'
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border hover:border-primary/50 hover:bg-muted'
                                        }`}
                                >
                                    <FileSpreadsheet className="w-4 h-4" />
                                    <span>CSV</span>
                                </button>
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="text-xs text-muted-foreground">
                            Save as: <span className="font-mono text-foreground">{filename}.{format}</span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/20">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            className="h-8 px-3 text-sm"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDownload}
                            disabled={!filename.trim()}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-sm"
                        >
                            Download
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}
