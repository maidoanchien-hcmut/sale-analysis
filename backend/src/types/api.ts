// Types for pages.fm API responses

export interface ApiConversation {
    id: string;
    tags: ApiTag[];
    snippet: string;
    inserted_at: string;
    updated_at: string;
    message_count: number;
    customer_id: string;
    page_customer?: {
        id: string;
        name: string;
        gender?: string;
    };
    assignee_ids?: string[];
}

export interface ApiTag {
    id: number;
    text: string;
    color?: string;
}

export interface ApiMessage {
    id: string;
    message: string;
    original_message?: string;
    from: {
        id: string;
        name: string;
    };
    inserted_at: string;
    conversation_id: string;
}

export interface ApiConversationDetail {
    success: boolean;
    messages: ApiMessage[];
    customers?: ApiCustomer[];
}

export interface ApiCustomer {
    id: string;
    name: string;
    personal_info?: {
        gender?: string;
    };
}

// Scraper configuration
export interface ScraperConfig {
    pageId: string;
    pageAccessToken: string;
    fromDate: string;
    toDate: string;
}
