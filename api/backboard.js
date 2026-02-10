
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { message, threadId, runId, toolOutputs } = req.body
    const apiKey = process.env.BACKBOARD_API_KEY || 'espr_vlIK4b8pMlVOpbIAabTke8w30mc2Yrw2-cSP7hPcqSQ'
    const assistantId = process.env.BACKBOARD_ASSISTANT_ID || '79edbdbd-5796-456b-8d55-265c4ca568a7'
    const BASE_URL = 'https://app.backboard.io/api/v1'

    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
    }

    console.log('--- Backboard Agent Debug ---')
    console.log('Thread:', threadId, 'Run:', runId)

    try {
        let currentThreadId = threadId;

        // 1. Create Thread if needed
        if (!currentThreadId) {
            console.log('Creating new thread...')
            const tRes = await fetch(`${BASE_URL}/threads`, {
                method: 'POST',
                headers,
                body: JSON.stringify({})
            })
            if (!tRes.ok) {
                const err = await tRes.text()
                throw new Error(`Failed to create thread: ${tRes.status} ${err}`)
            }
            const tData = await tRes.json()
            currentThreadId = tData.id || tData.thread_id // Handle potential variations
        }

        let currentRunId = runId;

        // 2. Add Message (if provided and not submitting tool outputs)
        if (message && !toolOutputs) {
            console.log('Adding message to thread...')
            await fetch(`${BASE_URL}/threads/${currentThreadId}/messages`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ role: 'user', content: message })
            })
        }

        // 3. Create Run OR Submit Tool Outputs
        if (toolOutputs && currentRunId) {
            console.log('Submitting tool outputs...')
            const submitRes = await fetch(`${BASE_URL}/threads/${currentThreadId}/runs/${currentRunId}/submit-tool-outputs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ tool_outputs: toolOutputs })
            })
            if (!submitRes.ok) {
                const err = await submitRes.text()
                throw new Error(`Failed to submit tools: ${submitRes.status} ${err}`)
            }
            // Some APIs return the updated run object, others don't
            // Use currentRunId to continue checking
        } else if (message) {
            console.log('Creating run...')
            const runRes = await fetch(`${BASE_URL}/threads/${currentThreadId}/runs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ assistant_id: assistantId })
            })
            if (!runRes.ok) {
                const err = await runRes.text()
                throw new Error(`Failed to create run: ${runRes.status} ${err}`)
            }
            const runData = await runRes.json()
            currentRunId = runData.id
        }

        if (!currentRunId) {
            return res.status(400).json({ error: "No run created or resumed" });
        }

        // 4. Poll Run Status
        let runStatus = 'queued';
        let runData = null;
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds timeout

        while (['queued', 'in_progress'].includes(runStatus) && attempts < maxAttempts) {
            await sleep(1000);
            const checkRes = await fetch(`${BASE_URL}/threads/${currentThreadId}/runs/${currentRunId}`, { headers });
            if (!checkRes.ok) break;
            runData = await checkRes.json();
            runStatus = runData.status;
            attempts++;
        }

        console.log('Final Run Status:', runStatus)

        if (runStatus === 'requires_action') {
            return res.status(200).json({
                status: 'requires_action',
                threadId: currentThreadId,
                runId: currentRunId,
                tool_calls: runData.required_action?.submit_tool_outputs?.tool_calls || []
            });
        }

        if (runStatus === 'completed') {
            // Get messages
            const msgRes = await fetch(`${BASE_URL}/threads/${currentThreadId}/messages`, { headers });
            const msgData = await msgRes.json();

            // Handle array vs object wrapper
            const messages = Array.isArray(msgData) ? msgData : (msgData.data || []);

            // Find latest assistant message
            // Assuming messages are ordered newest first (standard for this API type) or oldest last
            // We want the most recent 'assistant' message
            const lastMsg = messages.find(m => m.role === 'assistant');
            let replyText = "No response content";

            if (lastMsg) {
                if (typeof lastMsg.content === 'string') {
                    replyText = lastMsg.content;
                } else if (Array.isArray(lastMsg.content)) {
                    replyText = lastMsg.content.map(c => c.text?.value || c.text || '').join('');
                }
            }

            return res.status(200).json({
                status: 'completed',
                reply: replyText,
                threadId: currentThreadId
            });
        }

        return res.status(500).json({
            error: `Run ended with status: ${runStatus}`,
            details: runData
        });

    } catch (error) {
        console.error('Agent Error:', error)
        return res.status(500).json({ error: error.message })
    }
}
