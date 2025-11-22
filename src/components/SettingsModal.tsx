import React, { useState, useEffect } from 'react';
import { X, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: EditorSettings;
    onSave: (settings: EditorSettings) => void;
}

export interface EditorSettings {
    tabSize: number;
    fontSize: number | 'auto';
    lineHeight: number;
}

export function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
    const [localSettings, setLocalSettings] = useState<EditorSettings>(settings);

    useEffect(() => {
        if (isOpen) {
            setLocalSettings(settings);
        }
    }, [isOpen, settings]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    const handleReset = () => {
        const defaultSettings: EditorSettings = {
            tabSize: 2,
            fontSize: 'auto',
            lineHeight: 1.6,
        };
        setLocalSettings(defaultSettings);
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
            <div
                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md transition-all duration-150 ease-out"
                style={{
                    opacity: isOpen ? 1 : 0,
                    transform: `translate(-50%, -50%) scale(${isOpen ? 1 : 0.95})`
                }}
            >
                <div className="bg-background border border-border rounded-lg shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-2">
                            <SettingsIcon className="w-4 h-4" />
                            <h2 className="text-sm font-medium">Editor Settings</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted p-0.5"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="px-4 py-3 space-y-4">
                        {/* Tab Size */}
                        <div className="space-y-1.5">
                            <label htmlFor="tabSize" className="text-xs font-medium text-muted-foreground">
                                Tab Size (spaces)
                            </label>
                            <Input
                                id="tabSize"
                                type="number"
                                min="1"
                                max="10"
                                value={localSettings.tabSize}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                        setLocalSettings({ ...localSettings, tabSize: '' as any });
                                    } else {
                                        const num = parseInt(val);
                                        if (!isNaN(num)) {
                                            setLocalSettings({ ...localSettings, tabSize: num });
                                        }
                                    }
                                }}
                                onBlur={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (isNaN(val) || val < 1) {
                                        setLocalSettings({ ...localSettings, tabSize: 2 });
                                    } else if (val > 10) {
                                        setLocalSettings({ ...localSettings, tabSize: 10 });
                                    }
                                }}
                                className="w-full h-8 text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <p className="text-xs text-muted-foreground">Number of spaces per indentation (max 10)</p>
                        </div>

                        {/* Font Size */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">
                                Font Size
                            </label>

                            {/* Auto/Manual Toggle */}
                            <div className="flex gap-2 mb-2">
                                <button
                                    onClick={() => setLocalSettings({ ...localSettings, fontSize: 'auto' })}
                                    className={`flex-1 px-3 py-1.5 rounded-md border text-xs transition-all ${localSettings.fontSize === 'auto'
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border hover:border-primary/50 hover:bg-muted'
                                        }`}
                                >
                                    Auto
                                </button>
                                <button
                                    onClick={() => {
                                        if (localSettings.fontSize === 'auto') {
                                            setLocalSettings({ ...localSettings, fontSize: Math.round(Math.max(14, Math.min(28, 14 + (window.innerWidth - 1280) * 0.006))) });
                                        }
                                    }}
                                    className={`flex-1 px-3 py-1.5 rounded-md border text-xs transition-all ${localSettings.fontSize !== 'auto'
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border hover:border-primary/50 hover:bg-muted'
                                        }`}
                                >
                                    Manual
                                </button>
                            </div>

                            {localSettings.fontSize === 'auto' ? (
                                <div className="h-8 flex items-center px-3 bg-muted/50 rounded-md border border-border text-sm text-muted-foreground">
                                    {Math.round(Math.max(14, Math.min(28, 14 + (window.innerWidth - 1280) * 0.006)))}px (responsive)
                                </div>
                            ) : (
                                <Input
                                    id="fontSize"
                                    type="number"
                                    min="10"
                                    max="28"
                                    value={localSettings.fontSize}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                            setLocalSettings({ ...localSettings, fontSize: '' as any });
                                        } else {
                                            const num = parseInt(val);
                                            if (!isNaN(num)) {
                                                setLocalSettings({ ...localSettings, fontSize: num });
                                            }
                                        }
                                    }}
                                    onBlur={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (isNaN(val) || val < 10) {
                                            setLocalSettings({ ...localSettings, fontSize: Math.round(Math.max(14, Math.min(28, 14 + (window.innerWidth - 1280) * 0.006))) });
                                        } else if (val > 28) {
                                            setLocalSettings({ ...localSettings, fontSize: 28 });
                                        }
                                    }}
                                    className="w-full h-8 text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                            )}
                            <p className="text-xs text-muted-foreground">
                                {localSettings.fontSize === 'auto' ? 'Automatically adjusts based on screen size' : 'Fixed font size in pixels'}
                            </p>
                        </div>

                        {/* Line Height */}
                        <div className="space-y-1.5">
                            <label htmlFor="lineHeight" className="text-xs font-medium text-muted-foreground">
                                Line Height
                            </label>
                            <Input
                                id="lineHeight"
                                type="number"
                                min="1"
                                max="3"
                                step="0.1"
                                value={localSettings.lineHeight}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                        setLocalSettings({ ...localSettings, lineHeight: '' as any });
                                    } else {
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) {
                                            setLocalSettings({ ...localSettings, lineHeight: num });
                                        }
                                    }
                                }}
                                onBlur={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (isNaN(val) || val < 1) {
                                        setLocalSettings({ ...localSettings, lineHeight: 1.6 });
                                    } else if (val > 3) {
                                        setLocalSettings({ ...localSettings, lineHeight: 3 });
                                    }
                                }}
                                className="w-full h-8 text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <p className="text-xs text-muted-foreground">Spacing between lines (1.0 - 3.0)</p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                        <Button
                            variant="ghost"
                            onClick={handleReset}
                            className="h-8 px-3 text-sm"
                        >
                            Reset to Default
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                className="h-8 px-3 text-sm"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-sm"
                            >
                                Save
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
