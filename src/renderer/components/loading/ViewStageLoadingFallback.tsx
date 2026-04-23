import { Spin, Typography } from 'antd';

const { Paragraph, Text } = Typography;

interface ViewStageLoadingFallbackProps {
	title: string;
	detail: string;
	compact?: boolean;
}

export default function ViewStageLoadingFallback({ title, detail, compact = false }: ViewStageLoadingFallbackProps) {
	return (
		<div
			className={`ViewStageLoadingFallback${compact ? ' ViewStageLoadingFallback--compact' : ''}`}
			role="status"
			aria-live="polite"
			aria-busy="true"
		>
			<div className={`ViewStageLoadingFallback__card${compact ? ' ViewStageLoadingFallback__card--compact' : ''}`}>
				<div className="ViewStageLoadingFallback__body">
					<Spin size={compact ? 'default' : 'large'} />
					<div className="ViewStageLoadingFallback__copy">
						<Text strong className="ViewStageLoadingFallback__title">
							{title}
						</Text>
						<Paragraph className="ViewStageLoadingFallback__detail">{detail}</Paragraph>
					</div>
				</div>
			</div>
		</div>
	);
}
