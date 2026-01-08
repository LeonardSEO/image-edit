'use client';

import { useCallback, useEffect, useState } from 'react';
import UploadZone from './UploadZone';
import { Sparkles, RefreshCw, Download, Plus } from 'lucide-react';
import Image from 'next/image';

export default function Visualizer() {
    const [roomImage, setRoomImage] = useState<string | null>(null);
    const [floorImages, setFloorImages] = useState<string[]>([]);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [resultAspect, setResultAspect] = useState<number | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [error, setError] = useState<string | null>(null);

    const readFileAsDataUrl = useCallback((file: File) => {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Uploaden mislukt'));
            reader.readAsDataURL(file);
        });
    }, []);

    const handleRoomUpload = useCallback(async (files: File[]) => {
        const file = files[0];
        if (!file) return;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            setRoomImage(dataUrl);
        } catch {
            setError('Uploaden mislukt');
        }
    }, [readFileAsDataUrl]);

    const handleFloorUpload = useCallback(async (files: File[]) => {
        if (files.length === 0) return;
        const results = await Promise.allSettled(files.map(readFileAsDataUrl));
        const dataUrls = results
            .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
            .map(result => result.value);
        if (dataUrls.length === 0) {
            setError('Uploaden mislukt');
            return;
        }
        setFloorImages(prev => {
            const next = [...prev];
            dataUrls.forEach((url) => {
                if (!next.includes(url)) {
                    next.push(url);
                }
            });
            return next.slice(0, 3);
        });
    }, [readFileAsDataUrl]);

    const getImageFilesFromClipboard = useCallback((event: ClipboardEvent) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const files = items
            .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
            .map(item => item.getAsFile())
            .filter((file): file is File => Boolean(file));

        const seen = new Set<string>();
        return files.filter(file => {
            const key = `${file.type}-${file.size}-${file.lastModified}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, []);

    const handleWindowPaste = useCallback(async (event: ClipboardEvent) => {
        const imageFiles = getImageFilesFromClipboard(event);
        if (imageFiles.length === 0) return;

        event.preventDefault();

        if (!roomImage) {
            const [first, ...rest] = imageFiles;
            await handleRoomUpload([first]);
            const remainingSlots = 3 - floorImages.length;
            if (rest.length > 0 && remainingSlots > 0) {
                await handleFloorUpload(rest.slice(0, remainingSlots));
            }
            return;
        }

        const remainingSlots = 3 - floorImages.length;
        if (remainingSlots <= 0) return;
        await handleFloorUpload(imageFiles.slice(0, remainingSlots));
    }, [floorImages.length, getImageFilesFromClipboard, handleFloorUpload, handleRoomUpload, roomImage]);

    useEffect(() => {
        const listener = (event: ClipboardEvent) => {
            void handleWindowPaste(event);
        };
        window.addEventListener('paste', listener as EventListener);
        return () => window.removeEventListener('paste', listener as EventListener);
    }, [handleWindowPaste]);

    useEffect(() => {
        if (!resultImage) {
            setResultAspect(null);
            return;
        }
        const img = new window.Image();
        img.onload = () => {
            if (img.naturalWidth && img.naturalHeight) {
                setResultAspect(img.naturalWidth / img.naturalHeight);
            }
        };
        img.src = resultImage;
    }, [resultImage]);

    const handleRemoveRoom = (_index: number) => setRoomImage(null);
    const handleRemoveFloor = (index: number) => {
        setFloorImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerate = async () => {
        if (!roomImage || floorImages.length === 0) return;

        setError(null);
        setIsGenerating(true);
        setStatusMessage('AI verzoek verstuurd...');
        setResultAspect(null);

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomImage,
                    floorImages,
                }),
            });

            if (!response.ok || !response.body) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || 'Er is iets misgegaan');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? '';

                for (const part of parts) {
                    const lines = part.split('\n');
                    let eventType = 'message';
                    const dataLines: string[] = [];

                    for (const line of lines) {
                        if (line.startsWith('event:')) {
                            eventType = line.replace('event:', '').trim();
                        } else if (line.startsWith('data:')) {
                            dataLines.push(line.replace('data:', '').trim());
                        }
                    }

                    const data = dataLines.join('\n');
                    if (!data) continue;

                    if (eventType === 'status') {
                        setStatusMessage(data);
                    } else if (eventType === 'image') {
                        setResultImage(data);
                        setStatusMessage('Afbeelding ontvangen');
                    } else if (eventType === 'error') {
                        setError(data);
                    } else if (eventType === 'done') {
                        setStatusMessage('');
                    }
                }
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsGenerating(false);
        }
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
        setResultAspect(null);
        setStatusMessage('');
        setError(null);
    };

    return (
        <div className="relative max-w-6xl mx-auto px-6 py-12">
            {!resultImage && !isGenerating ? (
                <div className="space-y-10 animate-[fadeUp_0.7s_ease-out]">
                    <div className="text-center space-y-4">
                        <h1 className="text-4xl md:text-5xl font-display text-gray-900">
                            Visualiseer uw <span className="text-primary">nieuwe vloer</span> in seconden
                        </h1>
                        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
                            Upload een sfeerfoto en maximaal drie vloerfoto&apos;s. Onze AI vervangt uitsluitend de vloer.
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
                            disabled={!roomImage || floorImages.length === 0 || isGenerating}
                            className={`
                flex items-center justify-center space-x-3 px-10 py-4 rounded-full text-lg font-semibold transition-all shadow-lg
                ${!roomImage || floorImages.length === 0 || isGenerating
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
                            {isGenerating ? 'AI is de vloer aan het leggen...' : 'Uw nieuwe interieur'}
                        </h2>
                        <p className="text-gray-500 mt-2">
                            {isGenerating ? 'Een moment geduld, we creëren uw droomvloer.' : 'Prachtig resultaat! Wat vindt u ervan?'}
                        </p>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-gray-700">Huidige Situatie</p>
                            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
                                {roomImage ? (
                                    <Image
                                        src={roomImage}
                                        alt="Sfeerfoto"
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                                        Geen sfeerfoto
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-gray-700">Nieuwe Vloer</p>
                            <div className="grid grid-cols-3 gap-3">
                                {floorImages.length > 0 ? (
                                    floorImages.map((image, index) => (
                                        <div
                                            key={index}
                                            className="relative aspect-square overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm"
                                        >
                                            <Image
                                                src={image}
                                                alt={`Vloerstaal ${index + 1}`}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-3 flex h-24 items-center justify-center rounded-xl border border-dashed border-orange-200 text-sm text-gray-400">
                                        Geen vloerstaal
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div
                        className="relative w-full rounded-[28px] overflow-hidden shadow-[0_30px_60px_-30px_rgba(22,16,10,0.55)] border border-white bg-white"
                        style={{ aspectRatio: resultAspect ? `${resultAspect}` : '16 / 10' }}
                    >
                        {isGenerating ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-linear-to-br from-orange-50 to-white">
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                                </div>
                                <p className="text-primary font-semibold animate-pulse">
                                    {statusMessage || 'Bezig met genereren...'}
                                </p>
                            </div>
                        ) : resultImage ? (
                            <>
                                <Image
                                    src={resultImage}
                                    alt="Gegenereerde vloer"
                                    fill
                                    className="object-contain"
                                    unoptimized
                                />
                            </>
                        ) : null}
                    </div>

                    {!isGenerating && resultImage && (
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
                                    disabled={isGenerating}
                                    className="flex items-center space-x-2 px-8 py-3 bg-white border-2 border-gray-100 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
                                >
                                    <RefreshCw className={`w-5 h-5 ${isGenerating ? 'animate-spin' : ''}`} />
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
