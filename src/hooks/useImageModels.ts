import { useEffect, useState } from 'react';
import { ImageModelOption } from '../config/imageModels';
import { fetchImageModels, getFallbackImageModels } from '../services/modelService';

export function useImageModels() {
    const [models, setModels] = useState<ImageModelOption[]>(() => getFallbackImageModels());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);

        fetchImageModels()
            .then(nextModels => {
                if (cancelled) return;
                setModels(nextModels);
                setError(null);
            })
            .catch(fetchError => {
                if (cancelled) return;
                setModels(getFallbackImageModels());
                setError(fetchError?.message || 'Failed to load image models');
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return { models, isLoading, error };
}
