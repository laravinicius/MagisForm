import { RefreshCw, WifiOff } from 'lucide-react';

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-muted gap-2">
      <RefreshCw className="w-5 h-5 animate-spin" /><span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <WifiOff className="w-10 h-10 text-danger" />
      <p className="text-muted font-medium">Erro ao carregar dados</p>
      <p className="text-muted text-sm text-center max-w-xs">{message}</p>
      <button onClick={onRetry} className="ui-button flex items-center gap-2 text-sm bg-row-alt hover:bg-sage px-4 py-2 rounded-lg transition-colors font-medium">
        <RefreshCw className="w-4 h-4" /> Tentar novamente
      </button>
    </div>
  );
}
