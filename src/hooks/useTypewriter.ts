import { useState, useEffect, useRef } from 'react';

/**
 * Typewriter hook — progressively reveals content character by character.
 * When `content` changes, the new text is "typed out" at the given speed.
 * If content is cleared or component unmounts, animation resets.
 */
export function useTypewriter(content: string, charsPerTick = 3, intervalMs = 16) {
    const [displayed, setDisplayed] = useState('');
    const indexRef = useRef(0);
    const prevContentRef = useRef('');

    useEffect(() => {
        // If content changed, start typing from where old content ended
        if (content !== prevContentRef.current) {
            // If new content starts with old content (append case), continue from old length
            if (content.startsWith(prevContentRef.current)) {
                indexRef.current = prevContentRef.current.length;
            } else {
                // Completely new content, start from scratch
                indexRef.current = 0;
                setDisplayed('');
            }
            prevContentRef.current = content;
        }

        if (indexRef.current >= content.length) {
            setDisplayed(content);
            return;
        }

        const timer = setInterval(() => {
            indexRef.current = Math.min(indexRef.current + charsPerTick, content.length);
            setDisplayed(content.slice(0, indexRef.current));

            if (indexRef.current >= content.length) {
                clearInterval(timer);
            }
        }, intervalMs);

        return () => clearInterval(timer);
    }, [content, charsPerTick, intervalMs]);

    return displayed;
}
