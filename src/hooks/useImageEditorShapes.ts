/**
 * useImageEditorShapes.ts
 *
 * Manages rectangle and ellipse shape annotations for the image editor.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorElement, ShapeElement } from '../components/modals/imageEditor/imageEditor.types';

type ShapeType = 'rectangle' | 'ellipse';

interface UseImageEditorShapesProps {
    shapeCanvasRef: React.RefObject<HTMLCanvasElement>;
    imageRef: React.RefObject<HTMLImageElement>;
    saveState: () => void;
    setElements: React.Dispatch<React.SetStateAction<EditorElement[]>>;
    strokeColor: string;
    strokeWidth: number;
}

export const drawShapeElement = (ctx: CanvasRenderingContext2D, element: ShapeElement) => {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = element.strokeWidth;
    ctx.strokeStyle = element.strokeColor;

    if (element.filled) {
        ctx.fillStyle = element.fillColor || element.strokeColor;
    }

    ctx.beginPath();
    if (element.shape === 'ellipse') {
        ctx.ellipse(
            element.x + element.width / 2,
            element.y + element.height / 2,
            Math.abs(element.width / 2),
            Math.abs(element.height / 2),
            0,
            0,
            Math.PI * 2
        );
    } else {
        ctx.rect(element.x, element.y, element.width, element.height);
    }

    if (element.filled) {
        ctx.fill();
    }

    ctx.stroke();
    ctx.restore();
};

export const useImageEditorShapes = ({
    shapeCanvasRef,
    imageRef,
    saveState,
    setElements,
    strokeColor,
    strokeWidth
}: UseImageEditorShapesProps) => {
    const [isShapeMode, setIsShapeMode] = useState(false);
    const [shapeType, setShapeType] = useState<ShapeType>('rectangle');
    const [filled, setFilled] = useState(false);
    const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
    const [shapeEnd, setShapeEnd] = useState<{ x: number; y: number } | null>(null);
    const isDrawingShapeRef = useRef(false);

    useEffect(() => {
        if (isShapeMode && imageRef.current && shapeCanvasRef.current) {
            shapeCanvasRef.current.width = imageRef.current.clientWidth;
            shapeCanvasRef.current.height = imageRef.current.clientHeight;
        }
    }, [isShapeMode, imageRef, shapeCanvasRef]);

    const getShapeCanvasCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = shapeCanvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }, [shapeCanvasRef]);

    const normalizeShape = useCallback((start: { x: number; y: number }, end: { x: number; y: number }): ShapeElement => {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);

        return {
            id: `shape-${Date.now()}`,
            type: 'shape',
            shape: shapeType,
            x,
            y,
            width,
            height,
            strokeColor,
            strokeWidth: Math.max(1, strokeWidth || 3),
            fillColor: strokeColor,
            fillOpacity: 1,
            filled
        };
    }, [filled, shapeType, strokeColor, strokeWidth]);

    const clearPreview = useCallback(() => {
        const canvas = shapeCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [shapeCanvasRef]);

    useEffect(() => {
        if (!isShapeMode || !shapeStart || !shapeEnd || !shapeCanvasRef.current) return;

        const canvas = shapeCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawShapeElement(ctx, normalizeShape(shapeStart, shapeEnd));
    }, [isShapeMode, normalizeShape, shapeCanvasRef, shapeEnd, shapeStart]);

    const startShape = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isShapeMode) return;
        isDrawingShapeRef.current = true;
        const coords = getShapeCanvasCoordinates(e);
        setShapeStart(coords);
        setShapeEnd(coords);
    }, [getShapeCanvasCoordinates, isShapeMode]);

    const drawShapePreview = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isShapeMode || !isDrawingShapeRef.current || !shapeStart) return;
        setShapeEnd(getShapeCanvasCoordinates(e));
    }, [getShapeCanvasCoordinates, isShapeMode, shapeStart]);

    const finishShape = useCallback(() => {
        if (!isShapeMode || !isDrawingShapeRef.current || !shapeStart || !shapeEnd) {
            isDrawingShapeRef.current = false;
            clearPreview();
            return;
        }

        const nextShape = normalizeShape(shapeStart, shapeEnd);
        if (nextShape.width >= 4 && nextShape.height >= 4) {
            saveState();
            setElements(prev => [...prev, nextShape]);
        }

        clearPreview();
        isDrawingShapeRef.current = false;
        setShapeStart(null);
        setShapeEnd(null);
    }, [clearPreview, isShapeMode, normalizeShape, saveState, setElements, shapeEnd, shapeStart]);

    return {
        isShapeMode,
        setIsShapeMode,
        shapeType,
        setShapeType,
        filled,
        setFilled,
        startShape,
        drawShapePreview,
        finishShape
    };
};
