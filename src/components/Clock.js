import React from 'react';

const Clock = () => {
    const [time, setTime] = React.useState(new Date());

    React.useEffect(() => {
        const timerId = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    return (
        <div className="text-center bg-gray-100 p-4 rounded-lg shadow-inner">
            <p className="text-5xl md:text-7xl font-mono font-bold text-gray-800">
                {time.toLocaleTimeString('it-IT')}
            </p>
            <p className="text-lg text-gray-500">{time.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
    );
};

export default Clock;