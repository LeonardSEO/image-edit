'use client';

import { Upload, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useRef, useState } from 'react';

interface UploadZoneProps {
    label: string;
    description: string;
    onUpload: (files: File[]) => void;
    maxFiles?: number;
    accept?: string;
    previews: string[];
    onRemove: (index: number) => void;
}

export default function UploadZone({
    label,
    description,
    onUpload,
    maxFiles = 1,
    accept = "image/*",
    previews,
    onRemove
}: UploadZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            onUpload(files.slice(0, maxFiles));
        }
    }, [onUpload, maxFiles]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length > 0) {
            onUpload(files.slice(0, maxFiles));
        }
    }, [onUpload, maxFiles]);

    return (
        <div className="flex flex-col space-y-3 w-full">
            <h3 className="text-lg font-semibold text-gray-800">{label}</h3>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
          relative border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer
          ${isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/50 bg-white'}
          ${previews.length >= maxFiles ? 'pointer-events-none opacity-50' : ''}
        `}
                onClick={() => {
                    if (previews.length < maxFiles) {
                        inputRef.current?.click();
                    }
                }}
            >
                <input
                    type="file"
                    accept={accept}
                    multiple={maxFiles > 1}
                    className="hidden"
                    ref={inputRef}
                    onChange={handleFileChange}
                />

                <div className="bg-orange-50 p-4 rounded-full mb-4">
                    <Upload className="w-8 h-8 text-primary" />
                </div>

                <p className="text-gray-700 font-medium">{description}</p>
                <p className="text-gray-400 text-sm mt-1">Sleep een foto hierheen of klik om te uploaden</p>
            </div>

            {previews.length > 0 && (
                <div className={`grid ${previews.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mt-4`}>
                    {previews.map((preview, index) => (
                        <div key={index} className="relative group aspect-video rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-white">
                            <Image
                                src={preview}
                                alt={`Preview ${index}`}
                                fill
                                className="object-cover"
                            />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(index);
                                }}
                                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
