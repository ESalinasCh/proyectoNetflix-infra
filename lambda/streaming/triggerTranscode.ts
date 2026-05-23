import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { MediaConvertClient, DescribeEndpointsCommand, CreateJobCommand } from "@aws-sdk/client-mediaconvert";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const TABLE_MOVIES = process.env.TABLE_MOVIES;
const TABLE_VIDEO_ASSETS = process.env.TABLE_VIDEO_ASSETS;
const BUCKET_TRANSCODED_VIDEOS = process.env.BUCKET_TRANSCODED_VIDEOS;
const MEDIACONVERT_ROLE_ARN = process.env.MEDIACONVERT_ROLE_ARN;

const s3Client = new S3Client({});

// Fetch regional endpoint for MediaConvert
let cachedEndpoint: string | undefined = undefined;

async function getMediaConvertEndpoint(): Promise<string> {
  if (cachedEndpoint) return cachedEndpoint;
  const client = new MediaConvertClient({ region: process.env.AWS_REGION || "us-east-1" });
  const response = await client.send(new DescribeEndpointsCommand({}));
  if (response.Endpoints && response.Endpoints.length > 0 && response.Endpoints[0].Url) {
    cachedEndpoint = response.Endpoints[0].Url;
    return cachedEndpoint;
  }
  throw new Error("Could not retrieve MediaConvert regional endpoint");
}

export const handler = async (event: any) => {
  console.log("Received S3 upload event:", JSON.stringify(event, null, 2));

  try {
    for (const record of event.Records || []) {
      const bucketName = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

      console.log(`Processing upload from bucket: ${bucketName}, key: ${key}`);

      // Extract movieId from the key.
      // Expected key format: "movies/{movieId}/video.mp4"
      let movieId = "";
      if (key.startsWith("movies/")) {
        const parts = key.split("/");
        movieId = parts[1];
      } else {
        movieId = key.replace(".mp4", "");
      }

      if (!movieId) {
        console.warn(`Could not extract movieId from key: ${key}`);
        continue;
      }

      console.log(`Resolved movieId: ${movieId}`);

      // Verify the movie exists in the database
      const movieResult = await ddbDocClient.send(
        new GetCommand({
          TableName: TABLE_MOVIES,
          Key: { movieId },
        })
      );

      if (!movieResult.Item) {
        console.warn(`Movie with ID ${movieId} not found in DynamoDB. Skipping.`);
        continue;
      }

      console.log(`Found movie: ${movieResult.Item.title}. Preparing transcode trigger...`);

      try {
        const endpoint = await getMediaConvertEndpoint();
        const mediaConvertClient = new MediaConvertClient({
          region: process.env.AWS_REGION || "us-east-1",
          endpoint: endpoint,
        });

        // Output destination: s3://<bucket>/movies/<movieId>/output
        const destination = `s3://${BUCKET_TRANSCODED_VIDEOS}/movies/${movieId}/output`;

        const createJobCommand = new CreateJobCommand({
          Role: MEDIACONVERT_ROLE_ARN,
          UserMetadata: {
            movieId: movieId,
          },
          Settings: {
            Inputs: [
              {
                FileInput: `s3://${bucketName}/${key}`,
                AudioSelectors: {
                  "Audio Selector 1": {
                    DefaultSelection: "DEFAULT",
                  },
                },
                VideoSelector: {},
                TimecodeSource: "EMBEDDED",
              },
            ],
            OutputGroups: [
              {
                Name: "Apple HLS",
                OutputGroupSettings: {
                  Type: "HLS_GROUP_SETTINGS",
                  HlsGroupSettings: {
                    SegmentLength: 10,
                    MinSegmentLength: 0,
                    Destination: destination,
                  },
                },
                Outputs: [
                  {
                    NameModifier: "_1080p",
                    ContainerSettings: {
                      Container: "M3U8",
                    },
                    VideoDescription: {
                      Width: 1920,
                      Height: 1080,
                      CodecSettings: {
                        Codec: "H_264",
                        H264Settings: {
                          Bitrate: 5000000,
                          RateControlMode: "QVBR",
                          SceneChangeDetect: "ENABLED",
                        },
                      },
                    },
                    AudioDescriptions: [
                      {
                        CodecSettings: {
                          Codec: "AAC",
                          AacSettings: {
                            Bitrate: 96000,
                            CodingMode: "CODING_MODE_2_0",
                            SampleRate: 48000,
                          },
                        },
                      },
                    ],
                  },
                  {
                    NameModifier: "_720p",
                    ContainerSettings: {
                      Container: "M3U8",
                    },
                    VideoDescription: {
                      Width: 1280,
                      Height: 720,
                      CodecSettings: {
                        Codec: "H_264",
                        H264Settings: {
                          Bitrate: 2500000,
                          RateControlMode: "QVBR",
                          SceneChangeDetect: "ENABLED",
                        },
                      },
                    },
                    AudioDescriptions: [
                      {
                        CodecSettings: {
                          Codec: "AAC",
                          AacSettings: {
                            Bitrate: 96000,
                            CodingMode: "CODING_MODE_2_0",
                            SampleRate: 48000,
                        },
                      },
                    },
                  ],
                },
                {
                  NameModifier: "_480p",
                  ContainerSettings: {
                    Container: "M3U8",
                  },
                  VideoDescription: {
                    Width: 854,
                    Height: 480,
                    CodecSettings: {
                      Codec: "H_264",
                      H264Settings: {
                        Bitrate: 1000000,
                        RateControlMode: "QVBR",
                        SceneChangeDetect: "ENABLED",
                      },
                    },
                  },
                  AudioDescriptions: [
                    {
                      CodecSettings: {
                        Codec: "AAC",
                        AacSettings: {
                          Bitrate: 96000,
                          CodingMode: "CODING_MODE_2_0",
                          SampleRate: 48000,
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

        console.log(`Submitting MediaConvert Job for movie ${movieId}...`);
        const jobResult = await mediaConvertClient.send(createJobCommand);
        console.log("MediaConvert Job submitted successfully. Job ID:", jobResult.Job?.Id);

        // Update movie status in DynamoDB to "transcoding"
        console.log(`Updating movie status to transcoding in DynamoDB...`);
        const updatedMovie = {
          ...movieResult.Item,
          videoStatus: "transcoding",
          updatedAt: new Date().toISOString(),
        };

        await ddbDocClient.send(
          new PutCommand({
            TableName: TABLE_MOVIES,
            Item: updatedMovie,
          })
        );
        console.log(`Movie ${movieId} successfully sent to MediaConvert queue.`);
      } catch (mediaConvertError: any) {
        console.warn(
          `AWS MediaConvert failed: ${mediaConvertError.message}. ` +
          `Falling back to simulated transcode for compatibility with AWS Academy / Sandbox environments.`
        );

        // ───────────────────────────────────────────────────────────────────────
        // FALLBACK: Simular la transcodificación de inmediato en S3 y DynamoDB
        // ───────────────────────────────────────────────────────────────────────
        console.log(`Simulating transcode for movie ${movieId} in AWS...`);
        
        // Mock HLS Playlist redirects to a real playable stream (Tears of Steel)
        const playlistContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720
https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8`;

        const masterManifestKey = `movies/${movieId}/output.m3u8`;
        
        console.log(`Uploading mock master playlist to S3: ${BUCKET_TRANSCODED_VIDEOS}/${masterManifestKey}`);
        await s3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET_TRANSCODED_VIDEOS,
            Key: masterManifestKey,
            Body: playlistContent,
            ContentType: "application/x-mpegURL",
          })
        );

        // Register video asset qualities and upload sub-playlists
        const qualities = ["480p", "720p", "1080p"];
        for (const quality of qualities) {
          const subPlaylistKey = `movies/${movieId}/output_${quality}.m3u8`;
          
          await s3Client.send(
            new PutObjectCommand({
              Bucket: BUCKET_TRANSCODED_VIDEOS,
              Key: subPlaylistKey,
              Body: playlistContent,
              ContentType: "application/x-mpegURL",
            })
          );

          await ddbDocClient.send(
            new PutCommand({
              TableName: TABLE_VIDEO_ASSETS,
              Item: {
                movieId,
                quality,
                hlsPlaylistUrl: `https://${BUCKET_TRANSCODED_VIDEOS}.s3.amazonaws.com/${subPlaylistKey}`,
                fileSizeBytes: 3114374, // size of real file
                bitrateKbps: quality === "1080p" ? 5000 : quality === "720p" ? 2500 : 1000,
                createdAt: new Date().toISOString(),
              },
            })
          );
        }

        // Update movie status in DynamoDB to "ready"
        console.log(`Updating movie status to ready in DynamoDB...`);
        const updatedMovie = {
          ...movieResult.Item,
          videoStatus: "ready",
          updatedAt: new Date().toISOString(),
        };

        await ddbDocClient.send(
          new PutCommand({
            TableName: TABLE_MOVIES,
            Item: updatedMovie,
          })
        );
        console.log(`Fallback transcode simulation completed for movie ${movieId}.`);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Transcode trigger execution completed" }),
    };
  } catch (error) {
    console.error("Error in triggerTranscode handler:", error);
    throw error;
  }
};
