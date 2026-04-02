const seed = async () => {
    const results: boolean[] = [];

    for (let i = 0; i < 1000; i++) {

        const result = await fetch('http://localhost:3000/api/v1/tasks', {
            method: 'POST',
            body: JSON.stringify({
                "payload": {
                    "userId": 42,
                    "action": "send_email"
                }
            }),
            headers: {
                "Content-Type": 'application/json'
            }
        });

        results.push(result.ok);
    }

    return results;
}

const tasks: Promise<boolean[]>[] = [];
for (let i = 0; i < 1000; i++) {
    tasks.push(seed());
}

(async () => {
    const result = await Promise.allSettled(tasks);
    console.log(result);
})();