  import { useFilingStream } from '../lib/useFilingStream';
  import StatusBar from '../components/StatusBar';
  import FeedItem from '../components/FeedItem';
  const Activity = ({ size = 24, className = "" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );



  /**
   * Empty state component for dashboard
   */
  function EmptyState({ status, itemsCount: _itemsCount }) {
    const messages = {
      connecting: {
        title: 'Connecting to stream...',
        description: 'Establishing connection to live filings feed',
        icon: 'connecting',
      },
      offline: {
        title: 'Stream offline',
        description: 'Attempting to reconnect to the filings pipeline',
        icon: 'offline',
      },
      live: {
        title: 'Waiting for filings',
        description: 'Stream is live and monitoring for new filings',
        icon: 'waiting',
      },
    };

    const message = messages[status] || messages.live;

    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="p-4 rounded-full bg-(--color-accent-lighter)">
          <Activity size={32} className="text-(--color-accent-primary)" />
        </div>
        <div>
          <h3 className="font-sans text-lg font-600 text-(--color-text-primary) mb-1">
            {message.title}
          </h3>
          <p className="font-sans text-sm text-(--color-text-secondary)">
            {message.description}
          </p>
        </div>
      </div>
    );
  }

  export default function Dashboard() {
    const { items, status, sessionDate } = useFilingStream();

    return (
      <div className="flex h-[calc(100vh-64px)] flex-col bg-(--color-bg-primary)">
        {/* Status Bar */}
        <StatusBar
          status={status}
          newsCount={items.length}
          sessionDate={sessionDate}
        />

        {/* Feed Content */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState status={status} itemsCount={items.length} />
          ) : (
            <div className="divide-y divide-(--color-border-primary)">
              {items.map((item) => (
                <FeedItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
