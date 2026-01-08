'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import UploadZone from './UploadZone';
import { Sparkles, RefreshCw, Download, Plus } from 'lucide-react';
import Image from 'next/image';

export default function Visualizer() {
    const [roomImage, setRoomImage] = useState<string | null>(null);
    const [floorImages, setFloorImages] = useState<string[]>([]);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const handleRoomUpload = useCallback((files: File[]) => {
        const file = files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setRoomImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    }, []);

    const handleFloorUpload = useCallback((files: File[]) => {
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFloorImages(prev => [...prev, reader.result as string].slice(0, 3));
            };
            reader.readAsDataURL(file);
        });
    }, []);

    const handleWindowPaste = useCallback((event: ClipboardEvent) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageFiles = items
            .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
            .map(item => item.getAsFile())
            .filter((file): file is File => Boolean(file));

        if (imageFiles.length === 0) return;

        event.preventDefault();

        if (!roomImage) {
            const [first, ...rest] = imageFiles;
            handleRoomUpload([first]);
            const remainingSlots = 3 - floorImages.length;
            if (rest.length > 0 && remainingSlots > 0) {
                handleFloorUpload(rest.slice(0, remainingSlots));
            }
            return;
        }

        const remainingSlots = 3 - floorImages.length;
        if (remainingSlots <= 0) return;
        handleFloorUpload(imageFiles.slice(0, remainingSlots));
    }, [floorImages.length, handleFloorUpload, handleRoomUpload, roomImage]);

    useEffect(() => {
        const listener = (event: ClipboardEvent) => handleWindowPaste(event);
        window.addEventListener('paste', listener as EventListener);
        return () => window.removeEventListener('paste', listener as EventListener);
    }, [handleWindowPaste]);

    const handleRemoveRoom = (_index: number) => setRoomImage(null);
    const handleRemoveFloor = (index: number) => {
        setFloorImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerate = async () => {
        if (!roomImage || floorImages.length === 0) return;

        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch('/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        roomImage,
                        floorImages,
                    }),
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Er is iets misgegaan');

                setResultImage(data.imageUrl);
            } catch (err: any) {
                setError(err.message);
            }
        });
    };

    const handleDownload = async () => {
        if (!resultImage) return;

        try {
            const response = await fetch(resultImage);
            const blob = await response.blob();

            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.src = URL.createObjectURL(blob);

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(img.src);
                    canvas.toBlob((newBlob) => {
                        if (newBlob) {
                            const url = URL.createObjectURL(newBlob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `vloerenconcurrent-ontwerp-${Date.now()}.png`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                    }, 'image/png');
                }
            };
        } catch (err) {
            console.error('Download failed', err);
        }
    };

    const handleReset = () => {
        setRoomImage(null);
        setFloorImages([]);
        setResultImage(null);
        setError(null);
    };

    return (
        <div className="relative max-w-6xl mx-auto px-6 py-12">
            {!resultImage && !isPending ? (
                <div className="space-y-10 animate-[fadeUp_0.7s_ease-out]">
                    <div className="text-center space-y-4">
                        <h1 className="text-4xl md:text-5xl font-display text-gray-900">
                            Visualiseer uw <span className="text-primary">nieuwe vloer</span> in seconden
                        </h1>
                        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
                            Upload een sfeerfoto en maximaal twee vloerfoto's. Onze AI vervangt uitsluitend de vloer.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <UploadZone
                            label="Huidige Situatie"
                            description="Upload sfeerfoto"
                            onUpload={handleRoomUpload}
                            previews={roomImage ? [roomImage] : []}
                            onRemove={handleRemoveRoom}
                        />
                        <div className="space-y-2">
                            <UploadZone
                                label="Nieuwe Vloer"
                                description="Upload vloer staal"
                                maxFiles={3}
                                onUpload={handleFloorUpload}
                                previews={floorImages}
                                onRemove={handleRemoveFloor}
                            />
                            <p className="text-xs text-gray-500">
                                Je mag meerdere vloerfoto&apos;s toevoegen (max. 3). Aanbevolen voor een beter resultaat.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <button
                            onClick={handleGenerate}
                            disabled={!roomImage || floorImages.length === 0 || isPending}
                            className={`
                flex items-center justify-center space-x-3 px-10 py-4 rounded-full text-lg font-semibold transition-all shadow-lg
                ${!roomImage || floorImages.length === 0 || isPending
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    : 'bg-primary text-white hover:scale-[1.02] active:scale-[0.99] hover:shadow-orange-300/40'}
              `}
                        >
                            <Sparkles className="w-5 h-5" />
                            <span>Genereer Nieuwe Vloer</span>
                        </button>
                    </div>

                    {error && (
                        <p className="text-red-500 font-medium text-center">{error}</p>
                    )}
                </div>
            ) : (
                <div className="space-y-8 animate-[fadeUp_0.7s_ease-out]">
                    <div className="text-center">
                        <h2 className="text-3xl font-display text-gray-900">
                            {isPending ? 'AI is de vloer aan het leggen...' : 'Uw nieuwe interieur'}
                        </h2>
                        <p className="text-gray-500 mt-2">
                            {isPending ? 'Een moment geduld, we creëren uw droomvloer.' : 'Prachtig resultaat! Wat vindt u ervan?'}
                        </p>
                    </div>

                    <div className="relative aspect-[16/10] w-full rounded-[28px] overflow-hidden shadow-[0_30px_60px_-30px_rgba(22,16,10,0.55)] border border-white bg-white">
                        {isPending ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-gradient-to-br from-orange-50 to-white">
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                                </div>
                                <p className="text-primary font-semibold animate-pulse">Bezig met genereren...</p>
                            </div>
                        ) : resultImage ? (
                            <>
                                <Image
                                    src={resultImage}
                                    alt="Gegenereerde vloer"
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            </>
                        ) : null}
                    </div>

                    {!isPending && resultImage && (
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex flex-wrap justify-center gap-4">
                                <button
                                    onClick={handleDownload}
                                    className="flex items-center space-x-2 px-8 py-3 bg-white border-2 border-gray-100 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
                                >
                                    <Download className="w-5 h-5" />
                                    <span>Opslaan</span>
                                </button>

                                <button
                                    onClick={handleGenerate}
                                    disabled={isPending}
                                    className="flex items-center space-x-2 px-8 py-3 bg-white border-2 border-gray-100 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
                                >
                                    <RefreshCw className={`w-5 h-5 ${isPending ? 'animate-spin' : ''}`} />
                                    <span>Probeer opnieuw</span>
                                </button>

                                <button
                                    onClick={handleReset}
                                    className="flex items-center space-x-2 px-8 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-opacity-90 transition-all shadow-md"
                                >
                                    <Plus className="w-5 h-5" />
                                    <span>Nieuwe sfeerfoto</span>
                                </button>
                            </div>
                            {error && (
                                <p className="text-red-500 font-medium text-center">{error}</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
