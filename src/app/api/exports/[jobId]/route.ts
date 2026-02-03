import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const runtime = "nodejs";

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ jobId: string }> }
) {
    const params = await props.params;
    const { jobId } = params;
    const { searchParams } = new URL(request.url);
    const isDownload = searchParams.get('download') === 'true';

    try {
        const [status, result, error, format] = await Promise.all([
            redis.get(`export:${jobId}:status`),
            redis.get(`export:${jobId}:result`),
            redis.get(`export:${jobId}:error`),
            redis.get(`export:${jobId}:format`),
        ]);

        if (!status) {
            return NextResponse.json({ error: 'Export job not found' }, { status: 404 });
        }

        if (isDownload && status === 'completed' && result) {
            const resolvedFormat = (format === "xlsx" || format === "csv")
                ? format
                : (jobId.includes('xlsx') ? 'xlsx' : 'csv');

            if (resolvedFormat === 'xlsx') {
                const buffer = Buffer.from(result, 'base64');
                return new NextResponse(buffer, {
                    headers: {
                        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'Content-Disposition': `attachment; filename="zakrom_export_${Date.now()}.xlsx"`,
                    },
                });
            } else {
                return new NextResponse(result, {
                    headers: {
                        'Content-Type': 'text/csv',
                        'Content-Disposition': `attachment; filename="zakrom_export_${Date.now()}.csv"`,
                    },
                });
            }
        }

        return NextResponse.json({
            jobId,
            status,
            error: error || null,
            // Don't send huge result in status polling
            hasResult: !!result,
        });
    } catch (err: any) {
        console.error('Export API error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
