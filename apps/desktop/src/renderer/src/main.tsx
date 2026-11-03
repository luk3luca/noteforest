import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles.css';
import { App } from './App';
import { PrintApp } from './PrintApp';

const isPrint = new URLSearchParams(window.location.search).get('print') === '1';
const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(isPrint ? <PrintApp /> : <App />);
