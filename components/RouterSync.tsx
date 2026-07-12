import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageView } from '../types';

// Type for the view prop callbacks - matches React's setState signature
type ViewSetter = React.Dispatch<React.SetStateAction<PageView | 'public' | 'published'>>;
type FlowIdSetter = (id: string | null) => void;

interface RouterSyncProps {
    setView: ViewSetter;
    setCurrentFlowId: FlowIdSetter;
    setPublicFlowId: FlowIdSetter;
    setPublishedFlowId: FlowIdSetter;
    user: any;
}

/**
 * Syncs React Router location with the existing view-based state system
 */
export function RouterSync({ setView, setCurrentFlowId, setPublicFlowId, setPublishedFlowId, user }: RouterSyncProps) {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const path = location.pathname;

        // Route to view mapping
        if (path === '/security') {
            setView('security');
        } else if (path === '/terms') {
            setView('terms');
        } else if (path === '/privacy') {
            setView('privacy');
        } else if (path === '/refund') {
            setView('refund');
        } else if (path === '/docs') {
            setView('docs');
        } else if (path === '/features') {
            setView('features');
        } else if (path === '/legal') {
            setView('legal');
        } else if (path === '/settings') {
            setView('settings');
        } else if (path === '/dashboard') {
            setView('dashboard');
        } else if (path.startsWith('/flow/')) {
            const flowId = path.split('/')[2];
            if (flowId) {
                setCurrentFlowId(flowId);
                setView('editor');
            }
        } else if (path.startsWith('/public/')) {
            const flowId = path.split('/')[2];
            if (flowId) {
                setPublicFlowId(flowId);
                setView('public');
            }
        } else if (path.startsWith('/published/')) {
            const flowId = path.split('/')[2];
            if (flowId) {
                setPublishedFlowId(flowId);
                setView('published');
            }
        } else if (path === '/' || path === '') {
            if (user) {
                setView('dashboard');
            } else {
                setView('landing');
            }
        }
    }, [location.pathname, setView, setCurrentFlowId, setPublicFlowId, setPublishedFlowId, user]);

    return null; // This component doesn't render anything
}
