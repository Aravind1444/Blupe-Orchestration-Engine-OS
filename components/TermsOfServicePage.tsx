import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface TermsOfServicePageProps {
    onBack: () => void;
}

export const TermsOfServicePage: React.FC<TermsOfServicePageProps> = ({ onBack }) => {
    return (
        <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto px-6 py-12">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-8 transition-colors text-sm font-medium">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>

                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-4xl font-bold text-slate-900">Terms of Service</h1>
                    <div className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium">
                        Effective Date: December 6, 2025
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm mb-8">
                    <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed">
                        <p className="font-bold text-slate-900 text-base mb-4">
                            PLEASE READ THIS TERMS OF SERVICE AGREEMENT CAREFULLY. BY USING THIS WEBSITE FOR ANY PURPOSE, YOU AGREE TO BE BOUND BY ALL OF THE TERMS AND CONDITIONS OF THIS AGREEMENT.
                        </p>

                        <p>
                            This Terms of Service Agreement (the "Agreement") governs your use of this website, blupe.space (the "Website"), and the Blupe platform. This Agreement includes, and incorporates by this reference, the policies and guidelines referenced below. Blupe reserves the right to change or revise the terms and conditions of this Agreement at any time by posting any changes or a revised Agreement on this Website. Blupe will alert you that changes or revisions have been made by indicating on the top of this Agreement the date it was last revised. The changed or revised Agreement will be effective immediately after it is posted on this Website. Your use of the Website following the update will constitute your acceptance of any such changes or revisions.
                        </p>

                        <h3 className="text-slate-900 font-bold mt-8">I. WEBSITE</h3>

                        <h4 className="text-slate-900 font-semibold mt-4">Content and Intellectual Property</h4>
                        <p>
                            To the extent that Blupe creates the content on this Website, such content is protected by intellectual property laws. Unauthorized use of the material may violate copyright, trademark, and/or other laws. You acknowledge that your use of the content on this Website is for personal, noncommercial use.
                        </p>

                        <p>
                            The materials on Blupe's website are provided "as is". Blupe makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties, including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
                        </p>

                        <h4 className="text-slate-900 font-semibold mt-4">Use of Website</h4>
                        <p>
                            Blupe is not responsible for any damages resulting from the use of this website by anyone. You will not use the Website for illegal purposes. You will (1) abide by all applicable local, state, national, and international laws and regulations in your use of the Website, (2) not interfere with or disrupt the use of the Website by other users, (3) not resell material on the Website, (4) not engage, directly or indirectly, in transmission of "spam", chain letters, junk mail or any other type of unsolicited communication, and (5) not defame, harass, abuse, or disrupt other users of the Website.
                        </p>

                        <h4 className="text-slate-900 font-semibold mt-4">License</h4>
                        <p>
                            By using this Website, you are granted a limited, non-exclusive, non-transferable right to use the content and materials on the Website in connection with your normal, noncommercial use of the Website. You may not copy, reproduce, transmit, distribute, or create derivative works of such content or information without express written authorization from Blupe.
                        </p>

                        <h4 className="text-slate-900 font-semibold mt-4">User Content</h4>
                        <p>
                            By posting, storing, or transmitting any content on the Website, you hereby grant Blupe a perpetual, worldwide, non-exclusive, royalty-free, assignable right and license to use, copy, display, perform, create derivative works from, distribute, have distributed, transmit and assign such content in any form. You are solely responsible for your interactions with other users of the Website and any content you post. Blupe reserves the right, but has no obligation, to monitor interactions between users and to remove any content Blupe deems objectionable.
                        </p>

                        <h3 className="text-slate-900 font-bold mt-8">II. LIMITATION OF LIABILITY</h3>
                        <p>
                            Blupe will not be liable for any direct, indirect, incidental, special or consequential damages in connection with this agreement or the services in any manner, including liabilities resulting from (1) the use or the inability to use the website content or services; (2) any services availed through the website; or (3) any lost profits you allege.
                        </p>

                        <h3 className="text-slate-900 font-bold mt-8">III. INDEMNIFICATION</h3>
                        <p>
                            You will release, indemnify, defend and hold harmless Blupe, and any of its contractors, agents, employees, officers, directors, shareholders, affiliates and assigns from all liabilities, claims, damages, costs and expenses, including reasonable attorneys' fees and expenses, of third parties relating to or arising out of (1) this Agreement or the breach of your warranties, representations and obligations under this Agreement; (2) the Website content or your use of the Website content; (3) any intellectual property or other proprietary right of any person or entity; (4) your violation of any provision of this Agreement.
                        </p>

                        <h3 className="text-slate-900 font-bold mt-8">IV. PRIVACY</h3>
                        <p>
                            Blupe believes strongly in protecting user privacy and providing you with notice of our use of data. Please refer to our Privacy Policy, incorporated by reference herein, that is posted on the Website.
                        </p>

                        <h3 className="text-slate-900 font-bold mt-8">V. GENERAL</h3>

                        <h4 className="text-slate-900 font-semibold mt-4">Force Majeure</h4>
                        <p>
                            Blupe will not be deemed in default hereunder or held responsible for any cessation, interruption or delay in the performance of its obligations hereunder due to earthquake, flood, fire, storm, natural disaster, act of God, war, terrorism, armed conflict, labor strike, lockout, or boycott.
                        </p>

                        <h4 className="text-slate-900 font-semibold mt-4">Cessation of Operation</h4>
                        <p>
                            Blupe may at any time, in its sole discretion and without advance notice to you, cease operation of the Website and distribution of the services.
                        </p>

                        <h4 className="text-slate-900 font-semibold mt-4">Entire Agreement</h4>
                        <p>
                            This Agreement comprises the entire agreement between you and Blupe and supersedes any prior agreements pertaining to the subject matter contained herein.
                        </p>

                        <h4 className="text-slate-900 font-semibold mt-4">Waiver of Class Action Rights</h4>
                        <p>
                            By entering into this agreement, you hereby irrevocably waive any right you may have to join claims with those of others in the form of a class action or similar procedural device. Any claims arising out of, relating to, or in connection with this agreement must be asserted individually.
                        </p>

                        <h4 className="text-slate-900 font-semibold mt-4">Termination</h4>
                        <p>
                            Blupe reserves the right to terminate your access to the Website if it reasonably believes, in its sole discretion, that you have breached any of the terms and conditions of this Agreement. Following termination, you will not be permitted to use the Website.
                        </p>

                        <p className="font-bold text-slate-900 text-base mt-8">
                            BY USING THIS WEBSITE OR AVAILING SERVICES FROM THIS WEBSITE YOU AGREE TO BE BOUND BY ALL OF THE TERMS AND CONDITIONS OF THIS AGREEMENT.
                        </p>

                        <div className="mt-12 pt-8 border-t border-slate-100">
                            <p className="text-slate-500 text-sm">
                                For questions about these Terms of Service, please contact us at <a href="mailto:team@blupe.space" className="text-brand-600 hover:underline">team@blupe.space</a>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
