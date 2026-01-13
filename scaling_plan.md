# Recommendations for Scale

## Scraper Architecture

-   **Async Crawler:** Use an async crawler (e.g., Playwright/Puppeteer + concurrency limits) with robust pagination and retries.
-   **Normalization:** Normalize raw messages immediately, compute a stable `session_id` (source + thread id), and hash content for deduplication.
-   **Raw Storage:** Store raw events in an append-only store (object storage or a “raw_messages” table) for reprocessing.

## Pipeline Design

-   **Staged Processing:** Split into stages: **scrape → sessionize → analyze → import**. Use a persistent queue (RabbitMQ/SQS/Kafka) between stages for backpressure and retries.
-   **Batch Processing:** Sessionize in a streaming fashion; write sessions as newline-delimited JSON; process in bounded batches (e.g., 500–2000 sessions per job).
-   **Stateless Analysis:** Make the analyzer stateless per session; if an LLM is used, add a worker pool with rate limiting and exponential backoff.

## Storage and Database

-   **Bulk Operations:** Bulk insert with transactions; use prepared statements; commit in chunks.
-   **Indexing:** Index star-schema keys: `dim_*` unique codes, `fact_sessions(session_id_original)`, `fact_sessions(outcome_id)`, `fact_sessions(customer_id)`.
-   **Partitioning:** Partition large tables by time (monthly) or maintain summary tables for the dashboard to avoid scanning.
-   **Aggregates:** Maintain materialized aggregates (counts, averages) updated incrementally per batch.

## Performance and Memory

-   **Streaming:** Stream everything: don’t load all sessions into memory; use streaming JSON decoding/encoding and chunked IO.
-   **Compression:** Use gzip for at-rest artifacts and over-the-wire transfers.
-   **Caching:** Cache stable results; only re-analyze sessions whose hash changed.

## Resilience

-   **Idempotency:** Dedup by content hash, upsert by `session_id`.
-   **Observability:** Implement metrics (throughput, errors, queue depth, API rate), structured logs, and dead-letter queues.
-   **Checkpointing:** Persist progress offsets per source to resume scraping efficiently.

## Product Flow

-   **Scheduling:** Run scraping continuously or on a schedule, feeding data to the queue.
-   **Async Job API:** Provide an API where the client posts a scrape target, receives a job ID, polls status, and fetches results when done.
-   **Dashboarding:** Periodically rebuild aggregates or maintain incremental counters per imported batch for the dashboard.

## LLM Cost Control

-   **Pre-filtering:** Pre-filter sessions to skip spam/duplicates before sending to the LLM.
-   **Model Selection:** Use smaller models or logic rules for trivial classifications; reserve the LLM for edge cases.
-   **Token Management:** Consider sliding-window summarization to limit token usage for long threads.
